package poller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
	"github.com/RJ-Bond/js-monitoring/internal/notify"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	workerCount        = 50
	emptyPollInterval  = 60 * time.Second
	activePollInterval = 10 * time.Second
	schedulerTick      = 5 * time.Second
	historyFlushTick   = 30 * time.Second
	batchSize          = 100
	discordWorkerTick  = 1 * time.Minute
)

// Shared HTTP client for all outbound requests (Telegram, Discord, etc.)
// Reuses connections via Keep-Alive to avoid per-request overhead.
var pollerHTTPClient = &http.Client{
	Timeout: 10 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        50,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

type pollJob struct {
	server models.Server
}

type pollResult struct {
	serverID uint
	status   *models.ServerStatus
	players  []string // имена игроков на момент опроса (nil если не поддерживается)
}

// Poller — конкурентный опросчик серверов через Worker Pool
type Poller struct {
	jobs    chan pollJob
	results chan pollResult
	done    chan struct{}
	wg      sync.WaitGroup

	historyBuf []models.PlayerHistory
	historyMu  sync.Mutex

	// playerState хранит текущих игроков по серверу: serverID → (playerName → joinTime).
	// Доступ только из горутины processResults — мьютекс не нужен.
	playerState map[uint]map[string]time.Time

	// prevOnline отслеживает прошлый онлайн-статус для детекции переходов.
	// Доступ только из processResults — мьютекс не нужен.
	prevOnline map[uint]bool

	// offlineSince хранит момент перехода в офлайн для расчёта длительности простоя.
	// Доступ только из processResults — мьютекс не нужен.
	offlineSince map[uint]time.Time

	// discordLastSent хранит время последней отправки Discord-embed по serverID.
	// Доступ только из discordWorker — мьютекс не нужен.
	discordLastSent map[uint]time.Time

	OnUpdate func(serverID uint, status *models.ServerStatus)
}

func New(onUpdate func(serverID uint, status *models.ServerStatus)) *Poller {
	return &Poller{
		jobs:            make(chan pollJob, 2000),
		results:         make(chan pollResult, 2000),
		done:            make(chan struct{}),
		playerState:     make(map[uint]map[string]time.Time),
		prevOnline:      make(map[uint]bool),
		offlineSince:    make(map[uint]time.Time),
		discordLastSent: make(map[uint]time.Time),
		OnUpdate:        onUpdate,
	}
}

// Start запускает воркеры, обработчик результатов и планировщик
func (p *Poller) Start() {
	p.closeOrphanSessions()
	p.purgeScheduledDeletions() // run once on startup
	for i := 0; i < workerCount; i++ {
		p.wg.Add(1)
		go p.worker()
	}
	go p.processResults()
	go p.batchHistoryWriter()
	go p.scheduler()
	go p.discordWorker()
	go p.accountCleanupWorker()

	log.Printf("[Poller] started with %d workers", workerCount)
}

// accountCleanupWorker runs hourly to permanently delete accounts past their grace period.
func (p *Poller) accountCleanupWorker() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.purgeScheduledDeletions()
		case <-p.done:
			return
		}
	}
}

func (p *Poller) purgeScheduledDeletions() {
	var users []models.User
	if err := database.DB.
		Where("delete_scheduled_at IS NOT NULL AND delete_scheduled_at <= ?", time.Now().UTC()).
		Find(&users).Error; err != nil || len(users) == 0 {
		return
	}
	for _, u := range users {
		database.DB.Where("owner_id = ?", u.ID).Delete(&models.Server{})
		if err := database.DB.Delete(&models.User{}, u.ID).Error; err == nil {
			log.Printf("[cleanup] Deleted account %q (ID=%d) — grace period expired", u.Username, u.ID)
		}
	}
}

// Stop корректно завершает поллер
func (p *Poller) Stop() {
	close(p.done)
	p.wg.Wait()
	p.flushHistoryBuffer()
	log.Println("[Poller] stopped")
}

// worker — один воркер из пула; берёт задание из канала и опрашивает сервер
func (p *Poller) worker() {
	defer p.wg.Done()
	for {
		select {
		case job := <-p.jobs:
			status := p.query(&job.server)
			var players []string
			if status.OnlineStatus && status.PlayersNow > 0 {
				players = p.queryPlayers(&job.server)
			}
			p.results <- pollResult{serverID: job.server.ID, status: status, players: players}
		case <-p.done:
			return
		}
	}
}

// query выбирает протокол и возвращает результат опроса
func (p *Poller) query(srv *models.Server) *models.ServerStatus {
	var status *models.ServerStatus
	var err error

	switch srv.GameType {
	case "minecraft":
		status, err = QueryMinecraft(srv.IP, srv.Port)
	case "samp":
		status, err = QuerySAMP(srv.IP, srv.Port)
	case "source", "fivem", "gmod", "valheim", "dayz", "squad", "arma3", "rust", "vrising", "icarus":
		status, err = QuerySource(srv.IP, srv.Port)
	default:
		// minecraft_bedrock, terraria и другие — пробуем Source как fallback
		status, err = QuerySource(srv.IP, srv.Port)
	}

	if err != nil {
		return &models.ServerStatus{
			ServerID:     srv.ID,
			OnlineStatus: false,
			LastUpdate:   time.Now(),
		}
	}

	status.ServerID = srv.ID
	status.LastUpdate = time.Now()
	return status
}

// queryPlayers запрашивает список игроков по имени (для session tracking)
func (p *Poller) queryPlayers(srv *models.Server) []string {
	var serverPlayers []models.ServerPlayer
	var err error

	switch srv.GameType {
	case "source", "fivem", "gmod", "valheim", "dayz", "squad", "vrising", "terraria", "icarus":
		serverPlayers, err = QuerySourcePlayers(srv.IP, srv.Port)
	case "samp":
		serverPlayers, err = QuerySAMPPlayers(srv.IP, srv.Port)
	case "minecraft", "minecraft_bedrock":
		serverPlayers, err = QueryMinecraftPlayers(srv.IP, srv.Port)
	default:
		return nil
	}

	if err != nil || len(serverPlayers) == 0 {
		return nil
	}

	names := make([]string, 0, len(serverPlayers))
	for _, sp := range serverPlayers {
		if sp.Name != "" {
			names = append(names, sp.Name)
		}
	}
	return names
}

// processResults сохраняет статус в БД и уведомляет WebSocket клиентов
func (p *Poller) processResults() {
	for {
		select {
		case res := <-p.results:
			if res.status == nil {
				continue
			}

			// Upsert по server_id: INSERT при первом опросе, UPDATE при последующих
			database.DB.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "server_id"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"online_status", "players_now", "players_max",
					"current_map", "server_name", "ping_ms", "last_update",
				}),
			}).Create(res.status)

			// Добавить в буфер истории
			p.historyMu.Lock()
			p.historyBuf = append(p.historyBuf, models.PlayerHistory{
				ServerID:  res.serverID,
				Count:     res.status.PlayersNow,
				IsOnline:  res.status.OnlineStatus,
				PingMS:    res.status.PingMS,
				Timestamp: time.Now(),
			})
			p.historyMu.Unlock()

			// Отслеживать алерты при переходах online↔offline
			wasOnline, seen := p.prevOnline[res.serverID]
			isOnline := res.status.OnlineStatus
			if seen {
				if wasOnline && !isOnline {
					p.offlineSince[res.serverID] = time.Now()
					go p.sendOfflineAlert(res.serverID)
				} else if !wasOnline && isOnline {
					since := p.offlineSince[res.serverID]
					delete(p.offlineSince, res.serverID)
					go p.sendOnlineAlert(res.serverID, since)
				}
			}
			p.prevOnline[res.serverID] = isOnline

			// Отслеживать сессии игроков
			p.trackSessions(res.serverID, res.players, res.status.OnlineStatus)

			// Уведомить WebSocket клиентов
			if p.OnUpdate != nil {
				p.OnUpdate(res.serverID, res.status)
			}

		case <-p.done:
			return
		}
	}
}

// trackSessions обновляет in-memory состояние и сохраняет события join/leave в БД.
// Вызывается только из processResults (однопоточно) — мьютекс не нужен.
func (p *Poller) trackSessions(serverID uint, newPlayers []string, online bool) {
	now := time.Now()
	prev := p.playerState[serverID]
	if prev == nil {
		prev = map[string]time.Time{}
	}

	if !online {
		// Сервер офлайн — закрываем все открытые сессии
		for name, joinTime := range prev {
			dur := int(now.Sub(joinTime).Seconds())
			database.DB.Model(&models.PlayerSession{}).
				Where("server_id = ? AND ended_at IS NULL AND player_name = ?", serverID, name).
				Updates(map[string]interface{}{"ended_at": now, "duration": dur})
		}
		delete(p.playerState, serverID)
		return
	}

	// Строим set текущих игроков
	newSet := make(map[string]bool, len(newPlayers))
	for _, name := range newPlayers {
		if name != "" {
			newSet[name] = true
		}
	}

	// Ушедшие игроки: были в prev, нет в newSet
	for name, joinTime := range prev {
		if !newSet[name] {
			dur := int(now.Sub(joinTime).Seconds())
			database.DB.Model(&models.PlayerSession{}).
				Where("server_id = ? AND ended_at IS NULL AND player_name = ?", serverID, name).
				Updates(map[string]interface{}{"ended_at": now, "duration": dur})
			delete(prev, name)
		}
	}

	// Новые игроки: есть в newSet, нет в prev
	for name := range newSet {
		if _, exists := prev[name]; !exists {
			database.DB.Create(&models.PlayerSession{
				ServerID:   serverID,
				PlayerName: name,
				StartedAt:  now,
			})
			prev[name] = now
		}
	}

	p.playerState[serverID] = prev
}

// closeOrphanSessions закрывает сессии, оставшиеся открытыми после предыдущего запуска
func (p *Poller) closeOrphanSessions() {
	result := database.DB.Model(&models.PlayerSession{}).
		Where("ended_at IS NULL").
		Updates(map[string]interface{}{
			"ended_at": gorm.Expr("NOW()"),
			"duration": gorm.Expr("GREATEST(0, TIMESTAMPDIFF(SECOND, started_at, NOW()))"),
		})
	if result.RowsAffected > 0 {
		log.Printf("[Poller] closed %d orphan sessions on startup", result.RowsAffected)
	}
}

// batchHistoryWriter периодически сбрасывает буфер истории в БД одним запросом
func (p *Poller) batchHistoryWriter() {
	ticker := time.NewTicker(historyFlushTick)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			p.flushHistoryBuffer()
		case <-p.done:
			return
		}
	}
}

func (p *Poller) flushHistoryBuffer() {
	p.historyMu.Lock()
	if len(p.historyBuf) == 0 {
		p.historyMu.Unlock()
		return
	}
	batch := make([]models.PlayerHistory, len(p.historyBuf))
	copy(batch, p.historyBuf)
	p.historyBuf = p.historyBuf[:0]
	p.historyMu.Unlock()

	// Explicitly list columns so GORM doesn't skip is_online=false (zero-value bool).
	if err := database.DB.Select("server_id", "count", "is_online", "ping_ms", "timestamp").
		CreateInBatches(batch, batchSize).Error; err != nil {
		log.Printf("[Poller] batch history insert error: %v", err)
	} else {
		log.Printf("[Poller] flushed %d history records", len(batch))
	}
}

// sendOfflineAlert отправляет уведомление о переходе offline
func (p *Poller) sendOfflineAlert(serverID uint) {
	var cfg models.AlertsConfig
	if err := database.DB.Where("server_id = ? AND enabled = ?", serverID, true).First(&cfg).Error; err != nil {
		return
	}
	var srv models.Server
	if err := database.DB.First(&srv, serverID).Error; err != nil {
		return
	}
	text := fmt.Sprintf("🔴 <b>%s</b> — сервер недоступен", srv.Title)
	p.sendAlert(&cfg, "🔴 Сервер офлайн — "+srv.Title, text)
}

// sendOnlineAlert отправляет уведомление о восстановлении сервера
func (p *Poller) sendOnlineAlert(serverID uint, offlineSince time.Time) {
	var cfg models.AlertsConfig
	if err := database.DB.Where("server_id = ? AND enabled = ? AND notify_online = ?", serverID, true, true).First(&cfg).Error; err != nil {
		return
	}
	var srv models.Server
	if err := database.DB.First(&srv, serverID).Error; err != nil {
		return
	}
	text := fmt.Sprintf("🟢 <b>%s</b> — сервер снова доступен", srv.Title)
	if !offlineSince.IsZero() {
		mins := int(time.Since(offlineSince).Minutes())
		if mins > 0 {
			text += fmt.Sprintf(" (недоступен %d мин.)", mins)
		}
	}
	p.sendAlert(&cfg, "🟢 Сервер онлайн — "+srv.Title, text)
}

// sendAlert отправляет Telegram и/или email уведомление
func (p *Poller) sendAlert(cfg *models.AlertsConfig, emailSubject, tgText string) {
	// Telegram
	if cfg.TgChatID != "" {
		token := os.Getenv("TELEGRAM_BOT_TOKEN")
		if token != "" {
			apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
			formData := url.Values{
				"chat_id":    {cfg.TgChatID},
				"text":       {tgText},
				"parse_mode": {"HTML"},
			}
			req, err := http.NewRequest(http.MethodPost, apiURL, strings.NewReader(formData.Encode())) //nolint:noctx
			if err != nil {
				log.Printf("[Poller] telegram alert error: %v", err)
			} else {
				req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				resp, err := pollerHTTPClient.Do(req)
				if err != nil {
					log.Printf("[Poller] telegram alert error: %v", err)
				} else {
					resp.Body.Close()
				}
			}
		}
	}
	// Email
	if cfg.EmailTo != "" {
		if err := notify.SendEmail(cfg.EmailTo, emailSubject, stripHTML(tgText)); err != nil {
			log.Printf("[Poller] email alert error: %v", err)
		}
	}
}

// stripHTML удаляет HTML-теги из строки для email-уведомлений
func stripHTML(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			result.WriteRune(r)
		}
	}
	return result.String()
}

// discordWorker периодически обновляет Discord-виджеты для всех серверов с включённой интеграцией
func (p *Poller) discordWorker() {
	ticker := time.NewTicker(discordWorkerTick)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.runDiscordUpdates()
		case <-p.done:
			return
		}
	}
}

func (p *Poller) runDiscordUpdates() {
	var configs []models.DiscordConfig
	if err := database.DB.Where("enabled = ? AND webhook_url != ''", true).Find(&configs).Error; err != nil {
		return
	}
	now := time.Now()
	for _, cfg := range configs {
		interval := time.Duration(cfg.UpdateInterval) * time.Minute
		if interval < time.Minute {
			interval = time.Minute
		}
		if last, ok := p.discordLastSent[cfg.ServerID]; ok && now.Sub(last) < interval {
			continue
		}
		p.discordLastSent[cfg.ServerID] = now
		p.sendDiscordUpdate(cfg)
	}
}

func (p *Poller) sendDiscordUpdate(cfg models.DiscordConfig) {
	var srv models.Server
	if err := database.DB.Preload("Status").First(&srv, cfg.ServerID).Error; err != nil {
		return
	}

	siteName := p.discordSiteName()
	var appURL string
	var s models.SiteSettings
	if database.DB.First(&s, 1).Error == nil {
		appURL = s.AppURL
	}
	payload := discordBuildPayload(siteName, appURL, &srv, srv.Status)

	msgID, err := discordSendOrUpdate(cfg.WebhookURL, cfg.MessageID, payload)
	if err != nil {
		log.Printf("[Discord] ошибка обновления embed для сервера %d: %v", cfg.ServerID, err)
		return
	}
	if msgID != cfg.MessageID {
		database.DB.Model(&models.DiscordConfig{}).Where("id = ?", cfg.ID).Update("message_id", msgID)
	}
}

func (p *Poller) discordSiteName() string {
	var s models.SiteSettings
	if err := database.DB.First(&s, 1).Error; err != nil || s.SiteName == "" {
		return "JS Monitor"
	}
	return s.SiteName
}

var discordGameThumbnail = map[string]string{
	"gmod":     "https://cdn.cloudflare.steamstatic.com/steam/apps/4000/capsule_sm_120.jpg",
	"valheim":  "https://cdn.cloudflare.steamstatic.com/steam/apps/892970/capsule_sm_120.jpg",
	"squad":    "https://cdn.cloudflare.steamstatic.com/steam/apps/393380/capsule_sm_120.jpg",
	"dayz":     "https://cdn.cloudflare.steamstatic.com/steam/apps/221100/capsule_sm_120.jpg",
	"vrising":  "https://cdn.cloudflare.steamstatic.com/steam/apps/1604030/capsule_sm_120.jpg",
	"icarus":   "https://cdn.cloudflare.steamstatic.com/steam/apps/1149460/capsule_sm_120.jpg",
	"fivem":    "https://cdn.cloudflare.steamstatic.com/steam/apps/271590/capsule_sm_120.jpg",
	"samp":     "https://cdn.cloudflare.steamstatic.com/steam/apps/12120/capsule_sm_120.jpg",
	"terraria": "https://cdn.cloudflare.steamstatic.com/steam/apps/105600/capsule_sm_120.jpg",
	"rust":     "https://cdn.cloudflare.steamstatic.com/steam/apps/252490/capsule_sm_120.jpg",
	"arma3":    "https://cdn.cloudflare.steamstatic.com/steam/apps/107410/capsule_sm_120.jpg",
}

func discordBuildPayload(siteName, appURL string, srv *models.Server, status *models.ServerStatus) []byte {
	color := 10038562
	statusVal := "🔴 Офлайн"
	if status != nil && status.OnlineStatus {
		color = 3066993
		statusVal = "🟢 Онлайн"
	}

	title := srv.Title
	if title == "" && status != nil && status.ServerName != "" {
		title = status.ServerName
	}
	if title == "" {
		title = fmt.Sprintf("%s:%d", srv.IP, srv.Port)
	}

	addr := fmt.Sprintf("%s:%d", srv.IP, srv.Port)
	if srv.DisplayIP != "" {
		addr = fmt.Sprintf("%s:%d", srv.DisplayIP, srv.Port)
	}

	desc := fmt.Sprintf("`%s`", addr)
	if appURL != "" {
		desc += fmt.Sprintf("\n[🌐 Открыть на сайте](%s)", strings.TrimRight(appURL, "/"))
	}

	type thumbnail struct {
		URL string `json:"url"`
	}
	type field struct {
		Name   string `json:"name"`
		Value  string `json:"value"`
		Inline bool   `json:"inline"`
	}
	type footer struct {
		Text string `json:"text"`
	}
	type embed struct {
		Title       string     `json:"title"`
		Description string     `json:"description"`
		Color       int        `json:"color"`
		Fields      []field    `json:"fields,omitempty"`
		Thumbnail   *thumbnail `json:"thumbnail,omitempty"`
		Footer      footer     `json:"footer"`
		Timestamp   string     `json:"timestamp"`
	}
	type webhookPayload struct {
		Username string  `json:"username,omitempty"`
		Embeds   []embed `json:"embeds"`
	}

	fields := []field{{Name: "Статус", Value: statusVal, Inline: true}}
	if status != nil && status.OnlineStatus {
		fields = append(fields, field{Name: "Игроки", Value: fmt.Sprintf("%d/%d", status.PlayersNow, status.PlayersMax), Inline: true})
		if status.PingMS > 0 {
			fields = append(fields, field{Name: "Пинг", Value: fmt.Sprintf("%d ms", status.PingMS), Inline: true})
		}
		if status.CurrentMap != "" {
			fields = append(fields, field{Name: "Карта", Value: status.CurrentMap, Inline: true})
		}
	}

	e := embed{
		Title:       title,
		Description: desc,
		Color:       color,
		Fields:      fields,
		Footer:      footer{Text: siteName},
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
	}
	if thumbURL, ok := discordGameThumbnail[srv.GameType]; ok {
		e.Thumbnail = &thumbnail{URL: thumbURL}
	}

	pl := webhookPayload{Username: siteName, Embeds: []embed{e}}
	b, _ := json.Marshal(pl)
	return b
}

func discordSendOrUpdate(webhookURL, messageID string, payload []byte) (string, error) {
	if messageID != "" {
		patchURL := strings.TrimRight(webhookURL, "/") + "/messages/" + messageID
		req, err := http.NewRequest(http.MethodPatch, patchURL, bytes.NewReader(payload))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			resp, err := pollerHTTPClient.Do(req) //nolint:noctx
			if err == nil {
				_ = resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					return messageID, nil
				}
			}
		}
	}

	postURL := strings.TrimRight(webhookURL, "/") + "?wait=true"
	resp, err := pollerHTTPClient.Post(postURL, "application/json", bytes.NewReader(payload)) //nolint:noctx
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("discord вернул статус %d", resp.StatusCode)
	}
	var msgResp struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&msgResp)
	return msgResp.ID, nil
}

// scheduler — Smart Poller: адаптирует интервал опроса в зависимости от активности
func (p *Poller) scheduler() {
	ticker := time.NewTicker(schedulerTick)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			var servers []models.Server
			database.DB.Preload("Status").Find(&servers)

			now := time.Now()
			for _, srv := range servers {
				s := srv

				// Выбираем интервал: пустой сервер → 1 мин, активная игра → 10 сек
				interval := emptyPollInterval
				if s.Status != nil && s.Status.PlayersNow > 0 {
					interval = activePollInterval
				}

				// Нужен ли новый опрос?
				if s.Status == nil || now.Sub(s.Status.LastUpdate) >= interval {
					select {
					case p.jobs <- pollJob{server: s}:
					default:
						// Канал переполнен — пропускаем этот цикл
					}
				}
			}

		case <-p.done:
			return
		}
	}
}
