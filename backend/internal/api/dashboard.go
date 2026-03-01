package api

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GetDashboard GET /api/v1/admin/dashboard — агрегированная статистика для дашборда.
func GetDashboard(c echo.Context) error {
	// Игроков онлайн прямо сейчас
	var playersOnline int64
	database.DB.Model(&models.ServerStatus{}).
		Where("online_status = ?", true).
		Select("COALESCE(SUM(players_now), 0)").
		Scan(&playersOnline)

	// Серверов добавлено за последние 7 дней
	var serversAddedWeek int64
	database.DB.Model(&models.Server{}).
		Where("created_at >= ?", time.Now().AddDate(0, 0, -7)).
		Count(&serversAddedWeek)

	// Пользователей зарегистрировалось сегодня
	todayStart := time.Now().Truncate(24 * time.Hour)
	var usersJoinedToday int64
	database.DB.Model(&models.User{}).
		Where("created_at >= ?", todayStart).
		Count(&usersJoinedToday)

	// Топ-5 серверов по текущему числу игроков
	type topServer struct {
		ID         uint   `json:"id"`
		Title      string `json:"title"`
		GameType   string `json:"game_type"`
		PlayersNow int    `json:"players_now"`
		MaxPlayers int    `json:"max_players"`
	}
	var topServers []topServer
	database.DB.Table("servers").
		Select("servers.id, servers.title, servers.game_type, server_statuses.players_now, server_statuses.max_players").
		Joins("LEFT JOIN server_statuses ON server_statuses.server_id = servers.id").
		Where("server_statuses.online_status = ?", true).
		Order("server_statuses.players_now DESC").
		Limit(5).
		Scan(&topServers)
	if topServers == nil {
		topServers = []topServer{}
	}

	// Последние 5 записей аудита
	var recentAudit []models.AuditLog
	database.DB.Order("created_at DESC").Limit(5).Find(&recentAudit)
	if recentAudit == nil {
		recentAudit = []models.AuditLog{}
	}

	return c.JSON(http.StatusOK, echo.Map{
		"players_online":      playersOnline,
		"servers_added_week":  serversAddedWeek,
		"users_joined_today":  usersJoinedToday,
		"top_servers":         topServers,
		"recent_audit":        recentAudit,
	})
}
