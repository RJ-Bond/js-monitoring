package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
	"github.com/RJ-Bond/js-monitoring/internal/poller"
)

// Shared HTTP client with connection pooling (reused across all handler requests)
var sharedHTTPClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        50,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
	},
}

// In-memory GeoIP cache (24h TTL) to avoid repeated ip-api.com calls for the same IP
type geoIPEntry struct {
	country, code string
	expiresAt     time.Time
}

var geoCache sync.Map // map[string]geoIPEntry

// GetServers GET /api/v1/servers
func GetServers(c echo.Context) error {
	var servers []models.Server
	if err := database.DB.Preload("Status").Preload("AlertConfig").Find(&servers).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, servers)
}

// GetServer GET /api/v1/servers/:id
func GetServer(c echo.Context) error {
	id := c.Param("id")
	var server models.Server
	if err := database.DB.Preload("Status").Preload("AlertConfig").First(&server, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}
	return c.JSON(http.StatusOK, server)
}

// CreateServer POST /api/v1/servers
func CreateServer(c echo.Context) error {
	var server models.Server
	if err := c.Bind(&server); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}
	// Устанавливаем владельца из JWT
	if uid, ok := c.Get("user_id").(float64); ok {
		server.OwnerID = uint(uid)
	}
	if err := database.DB.Create(&server).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	actorID, actorName := actorFromCtx(c)
	logAudit(actorID, actorName, "create_server", "server", server.ID, server.Title)
	// Определяем страну по IP в фоне
	go func(s models.Server) {
		country, code := fetchGeoIP(s.IP)
		if code != "" {
			database.DB.Model(&models.Server{}).Where("id = ?", s.ID).
				Updates(map[string]interface{}{"country_code": code, "country_name": country})
		}
	}(server)
	return c.JSON(http.StatusCreated, server)
}

// UpdateServer PUT /api/v1/servers/:id
func UpdateServer(c echo.Context) error {
	id := c.Param("id")
	var server models.Server
	if err := database.DB.First(&server, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}

	// Проверка прав: владелец или админ
	role, _ := c.Get("role").(string)
	uid, _ := c.Get("user_id").(float64)
	if role != "admin" && server.OwnerID != uint(uid) {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "not your server"})
	}

	// Use a dedicated payload struct so json:"-" on Server fields doesn't block binding
	var payload struct {
		Title      string `json:"title"`
		IP         string `json:"ip"`
		DisplayIP  string `json:"display_ip"`
		Port       uint16 `json:"port"`
		GameType   string `json:"game_type"`
		SecretRCON string `json:"secret_rcon_key"`
	}
	if err := c.Bind(&payload); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}

	updates := map[string]interface{}{
		"title":      payload.Title,
		"ip":         payload.IP,
		"display_ip": payload.DisplayIP,
		"port":       payload.Port,
		"game_type":  payload.GameType,
	}
	if payload.SecretRCON != "" {
		updates["secret_rcon"] = payload.SecretRCON
	}
	if err := database.DB.Model(&server).Updates(updates).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "update_server", "server", server.ID, server.Title)
	}

	// Обновляем страну если IP изменился
	if payload.IP != "" && payload.IP != server.IP {
		go func(ip string, serverID uint) {
			country, code := fetchGeoIP(ip)
			if code != "" {
				database.DB.Model(&models.Server{}).Where("id = ?", serverID).
					Updates(map[string]interface{}{"country_code": code, "country_name": country})
			}
		}(payload.IP, server.ID)
	}

	database.DB.Preload("Status").Preload("AlertConfig").First(&server, id)
	return c.JSON(http.StatusOK, server)
}

// DeleteServer DELETE /api/v1/servers/:id
func DeleteServer(c echo.Context) error {
	id := c.Param("id")
	var server models.Server
	if err := database.DB.First(&server, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}

	// Проверка прав: владелец или админ
	role, _ := c.Get("role").(string)
	uid, _ := c.Get("user_id").(float64)
	if role != "admin" && server.OwnerID != uint(uid) {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "not your server"})
	}

	database.DB.Delete(&models.Server{}, id)
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "delete_server", "server", server.ID, server.Title)
	}
	return c.JSON(http.StatusOK, echo.Map{"message": "server deleted"})
}

// GetServerHistory GET /api/v1/servers/:id/history?period=24h|7d|30d
func GetServerHistory(c echo.Context) error {
	id := c.Param("id")
	period := c.QueryParam("period")

	var hours int
	switch period {
	case "7d":
		hours = 168
	case "30d":
		hours = 720
	default:
		hours = 24
	}

	serverID, err := strconv.Atoi(id)
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid server id"})
	}

	since := time.Now().Add(-time.Duration(hours) * time.Hour)

	var history []models.PlayerHistory
	database.DB.
		Where("server_id = ? AND timestamp > ?", serverID, since).
		Order("timestamp ASC").
		Find(&history)

	return c.JSON(http.StatusOK, history)
}

// GetStats GET /api/v1/stats — агрегированная статистика
func GetStats(c echo.Context) error {
	var totalServers, onlineServers, totalPlayers int64

	database.DB.Model(&models.Server{}).Count(&totalServers)
	database.DB.Model(&models.ServerStatus{}).Where("online_status = ?", true).Count(&onlineServers)
	database.DB.Model(&models.ServerStatus{}).
		Select("COALESCE(SUM(players_now), 0)").
		Scan(&totalPlayers)

	return c.JSON(http.StatusOK, echo.Map{
		"total_servers":  totalServers,
		"online_servers": onlineServers,
		"total_players":  totalPlayers,
	})
}

// GetServerPlayers GET /api/v1/servers/:id/players — список игроков на сервере
func GetServerPlayers(c echo.Context) error {
	id := c.Param("id")
	var server models.Server
	if err := database.DB.First(&server, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}

	var players []models.ServerPlayer
	var err error

	switch server.GameType {
	case "source", "fivem", "gmod", "valheim", "dayz", "squad", "vrising", "terraria":
		players, err = poller.QuerySourcePlayers(server.IP, server.Port)
	case "samp":
		players, err = poller.QuerySAMPPlayers(server.IP, server.Port)
	case "minecraft", "minecraft_bedrock":
		players, err = poller.QueryMinecraftPlayers(server.IP, server.Port)
	default:
		players = []models.ServerPlayer{}
	}

	if err != nil || players == nil {
		players = []models.ServerPlayer{}
	}
	return c.JSON(http.StatusOK, players)
}

// GetLeaderboard GET /api/v1/servers/:id/leaderboard?period=7d|30d|all
func GetLeaderboard(c echo.Context) error {
	serverID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid id"})
	}

	period := c.QueryParam("period")
	var since time.Time
	switch period {
	case "30d":
		since = time.Now().AddDate(0, 0, -30)
	case "all":
		// нулевое значение — без ограничения по времени
	default: // 7d
		since = time.Now().AddDate(0, 0, -7)
	}

	type leaderboardEntry struct {
		PlayerName   string     `json:"player_name"`
		TotalSeconds int        `json:"total_seconds"`
		Sessions     int        `json:"sessions"`
		LastSeen     *time.Time `json:"last_seen"`
	}

	var rows []leaderboardEntry
	q := database.DB.Model(&models.PlayerSession{}).
		Select(`player_name,
			SUM(CASE WHEN ended_at IS NOT NULL THEN duration
				ELSE GREATEST(0, TIMESTAMPDIFF(SECOND, started_at, NOW())) END) AS total_seconds,
			COUNT(*) AS sessions,
			MAX(COALESCE(ended_at, NOW())) AS last_seen`).
		Where("server_id = ?", serverID).
		Group("player_name").
		Order("total_seconds DESC").
		Limit(20)

	if !since.IsZero() {
		q = q.Where("started_at > ?", since)
	}

	q.Scan(&rows)

	if rows == nil {
		rows = []leaderboardEntry{}
	}
	return c.JSON(http.StatusOK, rows)
}

// ─── News ─────────────────────────────────────────────────────────────────────

// newsResponse extends NewsItem with the author's username and avatar
type newsResponse struct {
	models.NewsItem
	AuthorName   string `json:"author_name"`
	AuthorAvatar string `json:"author_avatar"`
}

// GetNews GET /api/v1/news?page=1&search=X&tag=Y — публичный список новостей
func GetNews(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	const limit = 10
	offset := (page - 1) * limit

	search := c.QueryParam("search")
	tag := c.QueryParam("tag")

	q := database.DB.Model(&models.NewsItem{}).
		Where("published = ? AND (publish_at IS NULL OR publish_at <= NOW())", true)
	if search != "" {
		like := "%" + search + "%"
		q = q.Where("title LIKE ? OR content LIKE ?", like, like)
	}
	if tag != "" {
		q = q.Where("FIND_IN_SET(?, tags) > 0", tag)
	}

	var total int64
	q.Count(&total)

	var items []models.NewsItem
	q.Order("pinned DESC, created_at DESC").Limit(limit).Offset(offset).Find(&items)

	seen := map[uint]bool{}
	ids := make([]uint, 0, len(items))
	for _, n := range items {
		if !seen[n.AuthorID] {
			ids = append(ids, n.AuthorID)
			seen[n.AuthorID] = true
		}
	}
	var users []models.User
	if len(ids) > 0 {
		database.DB.Select("id, username, avatar").Where("id IN ?", ids).Find(&users)
	}
	nameOf := map[uint]string{}
	avatarOf := map[uint]string{}
	for _, u := range users {
		nameOf[u.ID] = u.Username
		avatarOf[u.ID] = u.Avatar
	}

	result := make([]newsResponse, len(items))
	for i, n := range items {
		result[i] = newsResponse{NewsItem: n, AuthorName: nameOf[n.AuthorID], AuthorAvatar: avatarOf[n.AuthorID]}
	}
	return c.JSON(http.StatusOK, echo.Map{"items": result, "total": total})
}

// GetAdminNews GET /api/v1/admin/news — полный список (включая черновики)
func GetAdminNews(c echo.Context) error {
	var items []models.NewsItem
	database.DB.Order("pinned DESC, created_at DESC").Find(&items)

	seen := map[uint]bool{}
	ids := make([]uint, 0, len(items))
	for _, n := range items {
		if !seen[n.AuthorID] {
			ids = append(ids, n.AuthorID)
			seen[n.AuthorID] = true
		}
	}
	var users []models.User
	if len(ids) > 0 {
		database.DB.Select("id, username, avatar").Where("id IN ?", ids).Find(&users)
	}
	nameOf := map[uint]string{}
	avatarOf := map[uint]string{}
	for _, u := range users {
		nameOf[u.ID] = u.Username
		avatarOf[u.ID] = u.Avatar
	}
	result := make([]newsResponse, len(items))
	for i, n := range items {
		result[i] = newsResponse{NewsItem: n, AuthorName: nameOf[n.AuthorID], AuthorAvatar: avatarOf[n.AuthorID]}
	}
	return c.JSON(http.StatusOK, echo.Map{"items": result, "total": int64(len(items))})
}

// CreateNews POST /api/v1/admin/news — создать новость (только админ)
func CreateNews(c echo.Context) error {
	var req struct {
		Title         string  `json:"title"`
		Content       string  `json:"content"`
		ImageURL      string  `json:"image_url"`
		Tags          string  `json:"tags"`
		Pinned        bool    `json:"pinned"`
		Published     *bool   `json:"published"`
		PublishAt     *string `json:"publish_at"`
		SendToDiscord  *bool `json:"send_to_discord"`
		SendToTelegram *bool `json:"send_to_telegram"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" || req.Content == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "title and content required"})
	}
	var authorID uint
	if uid, ok := c.Get("user_id").(float64); ok {
		authorID = uint(uid)
	}
	published := true
	if req.Published != nil {
		published = *req.Published
	}
	var publishAt *time.Time
	if req.PublishAt != nil && *req.PublishAt != "" {
		publishAt = parsePublishAt(*req.PublishAt)
	}
	item := models.NewsItem{
		Title:     req.Title,
		Content:   req.Content,
		AuthorID:  authorID,
		ImageURL:  req.ImageURL,
		Tags:      req.Tags,
		Pinned:    req.Pinned,
		Published: published,
		PublishAt: publishAt,
	}
	if err := database.DB.Create(&item).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "create_news", "news", item.ID, item.Title)
	}
	if item.Published {
		var s models.SiteSettings
		database.DB.First(&s, 1)
		if req.SendToDiscord == nil || *req.SendToDiscord {
			SendNewsToDiscord(&item, s.AppURL, s.NewsWebhookURL, discordSiteName(), s.NewsRoleID)
		}
		if req.SendToTelegram == nil || *req.SendToTelegram {
			SendNewsToTelegram(&item, s.AppURL, s.NewsTGBotToken, s.NewsTGChatID)
		}
	}
	return c.JSON(http.StatusCreated, item)
}

// UpdateNews PUT /api/v1/admin/news/:id — обновить новость (только админ)
func UpdateNews(c echo.Context) error {
	id := c.Param("id")
	var item models.NewsItem
	if err := database.DB.First(&item, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "news not found"})
	}
	wasPublished := item.Published
	var req struct {
		Title          string  `json:"title"`
		Content        string  `json:"content"`
		ImageURL       string  `json:"image_url"`
		Tags           string  `json:"tags"`
		Pinned         *bool   `json:"pinned"`
		Published      *bool   `json:"published"`
		PublishAt      *string `json:"publish_at"`
		SendToDiscord  bool `json:"send_to_discord"`
		SendToTelegram bool `json:"send_to_telegram"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}
	updates := map[string]interface{}{
		"title":     req.Title,
		"content":   req.Content,
		"image_url": req.ImageURL,
		"tags":      req.Tags,
	}
	if req.Pinned != nil {
		updates["pinned"] = *req.Pinned
	}
	if req.Published != nil {
		updates["published"] = *req.Published
	}
	// publish_at: nil from JSON = clear field; non-empty string = set new value
	if req.PublishAt == nil || *req.PublishAt == "" {
		updates["publish_at"] = nil
	} else {
		if t := parsePublishAt(*req.PublishAt); t != nil {
			updates["publish_at"] = *t
		}
	}
	if err := database.DB.Model(&item).Updates(updates).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	database.DB.First(&item, id)
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "update_news", "news", item.ID, item.Title)
	}
	// Отправляем если: явно запрошено ИЛИ новость только что опубликована (была черновиком)
	justPublished := !wasPublished && item.Published
	if item.Published && (req.SendToDiscord || req.SendToTelegram || justPublished) {
		var s models.SiteSettings
		database.DB.First(&s, 1)
		if req.SendToDiscord || justPublished {
			SendNewsToDiscord(&item, s.AppURL, s.NewsWebhookURL, discordSiteName(), s.NewsRoleID)
		}
		if req.SendToTelegram || justPublished {
			SendNewsToTelegram(&item, s.AppURL, s.NewsTGBotToken, s.NewsTGChatID)
		}
	}
	return c.JSON(http.StatusOK, item)
}

// TrackView POST /api/v1/news/:id/view — увеличить счётчик просмотров
func TrackView(c echo.Context) error {
	id := c.Param("id")
	database.DB.Exec("UPDATE news_items SET views = views + 1 WHERE id = ?", id)
	return c.NoContent(http.StatusNoContent)
}

// DeleteNews DELETE /api/v1/admin/news/:id — удалить новость (только админ)
func DeleteNews(c echo.Context) error {
	id := c.Param("id")
	var item models.NewsItem
	database.DB.First(&item, id)
	database.DB.Delete(&models.NewsItem{}, id)
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "delete_news", "news", item.ID, item.Title)
	}
	return c.JSON(http.StatusOK, echo.Map{"message": "news deleted"})
}

// parsePublishAt парсит строку datetime-local ("2006-01-02T15:04") или RFC3339 в *time.Time
func parsePublishAt(s string) *time.Time {
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04"} {
		if t, err := time.ParseInLocation(layout, s, time.UTC); err == nil {
			return &t
		}
	}
	return nil
}

// ─── GeoIP ───────────────────────────────────────────────────────────────────

type geoIPResp struct {
	Country     string `json:"country"`
	CountryCode string `json:"countryCode"`
}

func fetchGeoIP(ip string) (country, code string) {
	// Check cache first
	if v, ok := geoCache.Load(ip); ok {
		entry := v.(geoIPEntry)
		if time.Now().Before(entry.expiresAt) {
			return entry.country, entry.code
		}
		geoCache.Delete(ip)
	}

	resp, err := sharedHTTPClient.Get("http://ip-api.com/json/" + ip + "?fields=country,countryCode") //nolint:noctx
	if err != nil {
		return
	}
	defer resp.Body.Close()
	var g geoIPResp
	if err := json.NewDecoder(resp.Body).Decode(&g); err != nil {
		return
	}

	geoCache.Store(ip, geoIPEntry{
		country:   g.Country,
		code:      g.CountryCode,
		expiresAt: time.Now().Add(24 * time.Hour),
	})
	return g.Country, g.CountryCode
}

// ─── Uptime ───────────────────────────────────────────────────────────────────

// GetUptime GET /api/v1/servers/:id/uptime — процент аптайма за 24 часа
func GetUptime(c echo.Context) error {
	id := c.Param("id")
	since := time.Now().Add(-24 * time.Hour)

	var total, online int64
	database.DB.Model(&models.PlayerHistory{}).
		Where("server_id = ? AND timestamp > ?", id, since).
		Count(&total)
	database.DB.Model(&models.PlayerHistory{}).
		Where("server_id = ? AND is_online = ? AND timestamp > ?", id, true, since).
		Count(&online)

	pct := 0.0
	if total > 0 {
		pct = float64(online) / float64(total) * 100
	}
	return c.JSON(http.StatusOK, echo.Map{
		"uptime_24h": pct,
		"total":      total,
		"online":     online,
	})
}

// ─── Global Leaderboard ───────────────────────────────────────────────────────

// GetGlobalLeaderboard GET /api/v1/leaderboard — топ игроков по суммарному времени
func GetGlobalLeaderboard(c echo.Context) error {
	type entry struct {
		Rank         int        `json:"rank"`
		PlayerName   string     `json:"player_name"`
		TotalSeconds int        `json:"total_seconds"`
		ServersCount int        `json:"servers_count"`
		LastSeen     *time.Time `json:"last_seen"`
	}

	var rows []entry
	database.DB.Model(&models.PlayerSession{}).
		Select(`player_name,
			SUM(CASE WHEN ended_at IS NOT NULL THEN duration
				ELSE GREATEST(0, TIMESTAMPDIFF(SECOND, started_at, NOW())) END) AS total_seconds,
			COUNT(DISTINCT server_id) AS servers_count,
			MAX(COALESCE(ended_at, NOW())) AS last_seen`).
		Group("player_name").
		Order("total_seconds DESC").
		Limit(100).
		Scan(&rows)

	for i := range rows {
		rows[i].Rank = i + 1
	}
	if rows == nil {
		rows = []entry{}
	}
	return c.JSON(http.StatusOK, rows)
}

// ─── Player Profile ───────────────────────────────────────────────────────────

// GetPlayerProfile GET /api/v1/players/:name — профиль игрока
func GetPlayerProfile(c echo.Context) error {
	name, err := url.PathUnescape(c.Param("name"))
	if err != nil || name == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid player name"})
	}

	type serverEntry struct {
		ServerID     uint       `json:"server_id"`
		ServerName   string     `json:"server_name"`
		TotalSeconds int        `json:"total_seconds"`
		LastSeen     *time.Time `json:"last_seen"`
	}

	var rows []serverEntry
	database.DB.Model(&models.PlayerSession{}).
		Select(`player_sessions.server_id,
			COALESCE(servers.title, '') AS server_name,
			SUM(CASE WHEN player_sessions.ended_at IS NOT NULL THEN player_sessions.duration
				ELSE GREATEST(0, TIMESTAMPDIFF(SECOND, player_sessions.started_at, NOW())) END) AS total_seconds,
			MAX(COALESCE(player_sessions.ended_at, NOW())) AS last_seen`).
		Joins("LEFT JOIN servers ON servers.id = player_sessions.server_id").
		Where("player_sessions.player_name = ?", name).
		Group("player_sessions.server_id").
		Order("total_seconds DESC").
		Scan(&rows)

	if rows == nil {
		rows = []serverEntry{}
	}

	var totalSeconds int
	var lastSeen *time.Time
	for _, r := range rows {
		totalSeconds += r.TotalSeconds
		if lastSeen == nil || (r.LastSeen != nil && r.LastSeen.After(*lastSeen)) {
			lastSeen = r.LastSeen
		}
	}

	return c.JSON(http.StatusOK, echo.Map{
		"player_name":   name,
		"total_seconds": totalSeconds,
		"last_seen":     lastSeen,
		"servers":       rows,
	})
}

// ─── RSS Feed ─────────────────────────────────────────────────────────────────

// GetNewsRSS GET /api/v1/news.rss — RSS 2.0 лента новостей
func GetNewsRSS(c echo.Context) error {
	var items []models.NewsItem
	database.DB.
		Where("published = ? AND (publish_at IS NULL OR publish_at <= NOW())", true).
		Order("pinned DESC, created_at DESC").
		Limit(20).
		Find(&items)

	// Базовый URL из настроек сайта
	var settings models.SiteSettings
	database.DB.First(&settings, 1)
	baseURL := strings.TrimRight(settings.AppURL, "/")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	siteName := settings.SiteName
	if siteName == "" {
		siteName = "JSMonitor"
	}

	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	sb.WriteString(`<rss version="2.0"><channel>`)
	sb.WriteString(fmt.Sprintf("<title>%s</title>", xmlEscape(siteName)))
	sb.WriteString(fmt.Sprintf("<link>%s</link>", xmlEscape(baseURL)))
	sb.WriteString("<description>Game server monitoring news</description>")
	sb.WriteString(fmt.Sprintf("<lastBuildDate>%s</lastBuildDate>", time.Now().UTC().Format(time.RFC1123Z)))

	for _, item := range items {
		sb.WriteString("<item>")
		sb.WriteString(fmt.Sprintf("<title>%s</title>", xmlEscape(item.Title)))
		sb.WriteString(fmt.Sprintf("<link>%s</link>", xmlEscape(baseURL)))
		sb.WriteString(fmt.Sprintf("<description><![CDATA[%s]]></description>", item.Content))
		sb.WriteString(fmt.Sprintf("<pubDate>%s</pubDate>", item.CreatedAt.UTC().Format(time.RFC1123Z)))
		sb.WriteString(fmt.Sprintf("<guid>%s/news/%d</guid>", baseURL, item.ID))
		sb.WriteString("</item>")
	}

	sb.WriteString("</channel></rss>")

	return c.Blob(http.StatusOK, "application/rss+xml; charset=utf-8", []byte(sb.String()))
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}
