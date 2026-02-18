package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
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
	if err := database.DB.Create(&server).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	return c.JSON(http.StatusCreated, server)
}

// UpdateServer PUT /api/v1/servers/:id
func UpdateServer(c echo.Context) error {
	id := c.Param("id")
	var server models.Server
	if err := database.DB.First(&server, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}
	if err := c.Bind(&server); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}
	database.DB.Save(&server)
	return c.JSON(http.StatusOK, server)
}

// DeleteServer DELETE /api/v1/servers/:id
func DeleteServer(c echo.Context) error {
	id := c.Param("id")
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
