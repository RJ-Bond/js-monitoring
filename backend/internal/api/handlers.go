package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
	"github.com/RJ-Bond/js-monitoring/internal/poller"
)

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
	case "source", "fivem", "gmod", "valheim", "dayz", "squad", "vrising", "icarus", "terraria":
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

// ─── News ─────────────────────────────────────────────────────────────────────

// newsResponse extends NewsItem with the author's username
type newsResponse struct {
	models.NewsItem
	AuthorName string `json:"author_name"`
}

// GetNews GET /api/v1/news — публичный список новостей
func GetNews(c echo.Context) error {
	var items []models.NewsItem
	database.DB.Order("created_at DESC").Limit(20).Find(&items)

	// Collect unique author IDs
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
		database.DB.Select("id, username").Where("id IN ?", ids).Find(&users)
	}
	nameOf := map[uint]string{}
	for _, u := range users {
		nameOf[u.ID] = u.Username
	}

	result := make([]newsResponse, len(items))
	for i, n := range items {
		result[i] = newsResponse{NewsItem: n, AuthorName: nameOf[n.AuthorID]}
	}
	return c.JSON(http.StatusOK, result)
}

// CreateNews POST /api/v1/admin/news — создать новость (только админ)
func CreateNews(c echo.Context) error {
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := c.Bind(&req); err != nil || req.Title == "" || req.Content == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "title and content required"})
	}
	var authorID uint
	if uid, ok := c.Get("user_id").(float64); ok {
		authorID = uint(uid)
	}
	item := models.NewsItem{Title: req.Title, Content: req.Content, AuthorID: authorID}
	if err := database.DB.Create(&item).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
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
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}
	if err := database.DB.Model(&item).Updates(map[string]interface{}{"title": req.Title, "content": req.Content}).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, item)
}

// DeleteNews DELETE /api/v1/admin/news/:id — удалить новость (только админ)
func DeleteNews(c echo.Context) error {
	id := c.Param("id")
	database.DB.Delete(&models.NewsItem{}, id)
	return c.JSON(http.StatusOK, echo.Map{"message": "news deleted"})
}

// ─── GeoIP ───────────────────────────────────────────────────────────────────

type geoIPResp struct {
	Country     string `json:"country"`
	CountryCode string `json:"countryCode"`
}

func fetchGeoIP(ip string) (country, code string) {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://ip-api.com/json/" + ip + "?fields=country,countryCode") //nolint:noctx
	if err != nil {
		return
	}
	defer resp.Body.Close()
	var g geoIPResp
	if err := json.NewDecoder(resp.Body).Decode(&g); err != nil {
		return
	}
	return g.Country, g.CountryCode
}
