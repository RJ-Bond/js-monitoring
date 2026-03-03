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
	now := time.Now()
	todayStart := now.Truncate(24 * time.Hour)
	yesterdayStart := todayStart.AddDate(0, 0, -1)
	weekAgo := now.AddDate(0, 0, -7)
	prevWeekStart := now.AddDate(0, 0, -14)

	// Игроков онлайн прямо сейчас
	var playersOnline int64
	database.DB.Model(&models.ServerStatus{}).
		Where("online_status = ?", true).
		Select("COALESCE(SUM(players_now), 0)").
		Scan(&playersOnline)

	// Серверов онлайн / офлайн
	var serversOffline int64
	database.DB.Model(&models.ServerStatus{}).
		Where("online_status = ?", false).
		Count(&serversOffline)

	// Пик игроков сегодня
	var peakPlayersToday int64
	database.DB.Model(&models.PlayerHistory{}).
		Select("COALESCE(MAX(count), 0)").
		Where("timestamp >= ?", todayStart).
		Scan(&peakPlayersToday)

	// Серверов добавлено за последние 7 дней
	var serversAddedWeek int64
	database.DB.Model(&models.Server{}).
		Where("created_at >= ?", weekAgo).
		Count(&serversAddedWeek)

	// Серверов добавлено за предыдущие 7 дней (для тренда)
	var serversAddedPrevWeek int64
	database.DB.Model(&models.Server{}).
		Where("created_at >= ? AND created_at < ?", prevWeekStart, weekAgo).
		Count(&serversAddedPrevWeek)

	// Пользователей зарегистрировалось сегодня
	var usersJoinedToday int64
	database.DB.Model(&models.User{}).
		Where("created_at >= ?", todayStart).
		Count(&usersJoinedToday)

	// Пользователей зарегистрировалось вчера (для тренда)
	var usersJoinedYesterday int64
	database.DB.Model(&models.User{}).
		Where("created_at >= ? AND created_at < ?", yesterdayStart, todayStart).
		Count(&usersJoinedYesterday)

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

	// Топ-5 офлайн-серверов
	type offlineServer struct {
		ID       uint   `json:"id"`
		Title    string `json:"title"`
		GameType string `json:"game_type"`
	}
	var topOffline []offlineServer
	database.DB.Table("servers").
		Select("servers.id, servers.title, servers.game_type").
		Joins("LEFT JOIN server_statuses ON server_statuses.server_id = servers.id").
		Where("server_statuses.online_status = ? OR server_statuses.server_id IS NULL", false).
		Limit(5).
		Scan(&topOffline)
	if topOffline == nil {
		topOffline = []offlineServer{}
	}

	// Игроки онлайн за последние 24 часа (по часам)
	type hourPoint struct {
		Hour  string `json:"hour"`
		Count int64  `json:"count"`
	}
	var online24h []hourPoint
	database.DB.Raw(`
		SELECT DATE_FORMAT(timestamp, '%H:00') as hour, COALESCE(SUM(count), 0) as count
		FROM player_histories
		WHERE timestamp >= ?
		GROUP BY DATE_FORMAT(timestamp, '%H:00')
		ORDER BY MIN(timestamp)
	`, now.Add(-24*time.Hour)).Scan(&online24h)
	if online24h == nil {
		online24h = []hourPoint{}
	}

	// Последние 5 записей аудита
	var recentAudit []models.AuditLog
	database.DB.Order("created_at DESC").Limit(5).Find(&recentAudit)
	if recentAudit == nil {
		recentAudit = []models.AuditLog{}
	}

	return c.JSON(http.StatusOK, echo.Map{
		"players_online":           playersOnline,
		"servers_offline":          serversOffline,
		"peak_players_today":       peakPlayersToday,
		"servers_added_week":       serversAddedWeek,
		"servers_added_prev_week":  serversAddedPrevWeek,
		"users_joined_today":       usersJoinedToday,
		"users_joined_yesterday":   usersJoinedYesterday,
		"top_servers":              topServers,
		"top_offline":              topOffline,
		"online_24h":               online24h,
		"recent_audit":             recentAudit,
	})
}
