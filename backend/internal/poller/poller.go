package poller

import (
	"log"
	"sync"
	"time"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
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
)

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

	OnUpdate func(serverID uint, status *models.ServerStatus)
}

func New(onUpdate func(serverID uint, status *models.ServerStatus)) *Poller {
	return &Poller{
		jobs:        make(chan pollJob, 2000),
		results:     make(chan pollResult, 2000),
		done:        make(chan struct{}),
		playerState: make(map[uint]map[string]time.Time),
		OnUpdate:    onUpdate,
	}
}

// Start запускает воркеры, обработчик результатов и планировщик
func (p *Poller) Start() {
	p.closeOrphanSessions()
	for i := 0; i < workerCount; i++ {
		p.wg.Add(1)
		go p.worker()
	}
	go p.processResults()
	go p.batchHistoryWriter()
	go p.scheduler()

	log.Printf("[Poller] started with %d workers", workerCount)
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
	case "source", "fivem", "gmod", "valheim", "dayz", "squad", "vrising", "icarus", "terraria":
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
				Timestamp: time.Now(),
			})
			p.historyMu.Unlock()

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

	if err := database.DB.CreateInBatches(batch, batchSize).Error; err != nil {
		log.Printf("[Poller] batch history insert error: %v", err)
	} else {
		log.Printf("[Poller] flushed %d history records", len(batch))
	}
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
