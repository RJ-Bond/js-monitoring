package api

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// ExportServers GET /api/v1/admin/export/servers.csv — admin only
func ExportServers(c echo.Context) error {
	type serverRow struct {
		models.Server
		OwnerName  string
		Online     bool
		PlayersNow int
		PlayersMax int
		LastUpdate time.Time
	}

	var servers []models.Server
	if err := database.DB.Preload("Status").Order("created_at ASC").Find(&servers).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	// Batch fetch owner names
	ownerIDs := make([]uint, 0, len(servers))
	seen := map[uint]bool{}
	for _, s := range servers {
		if !seen[s.OwnerID] {
			ownerIDs = append(ownerIDs, s.OwnerID)
			seen[s.OwnerID] = true
		}
	}
	var users []models.User
	if len(ownerIDs) > 0 {
		database.DB.Select("id, username").Where("id IN ?", ownerIDs).Find(&users)
	}
	nameOf := map[uint]string{}
	for _, u := range users {
		nameOf[u.ID] = u.Username
	}

	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", "attachment; filename=servers.csv")
	c.Response().WriteHeader(http.StatusOK)

	w := csv.NewWriter(c.Response().Writer)
	_ = w.Write([]string{"ID", "Title", "IP", "Port", "Game", "Country", "Owner", "Online", "Players", "Max Players", "Last Update"})

	for _, s := range servers {
		online := "No"
		playersNow, playersMax := 0, 0
		lastUpdate := ""
		if s.Status != nil {
			if s.Status.OnlineStatus {
				online = "Yes"
			}
			playersNow = s.Status.PlayersNow
			playersMax = s.Status.PlayersMax
			lastUpdate = s.Status.LastUpdate.Format(time.RFC3339)
		}
		_ = w.Write([]string{
			fmt.Sprint(s.ID),
			s.Title,
			s.IP,
			fmt.Sprint(s.Port),
			s.GameType,
			s.CountryName,
			nameOf[s.OwnerID],
			online,
			fmt.Sprint(playersNow),
			fmt.Sprint(playersMax),
			lastUpdate,
		})
	}
	w.Flush()
	return nil
}

// ExportAudit GET /api/v1/admin/export/audit.csv — admin only
func ExportAudit(c echo.Context) error {
	var logs []models.AuditLog
	database.DB.Order("created_at DESC").Limit(5000).Find(&logs)

	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", "attachment; filename=audit.csv")
	c.Response().WriteHeader(http.StatusOK)

	w := csv.NewWriter(c.Response().Writer)
	_ = w.Write([]string{"ID", "Actor", "Action", "Entity Type", "Entity ID", "Details", "Created At"})
	for _, l := range logs {
		_ = w.Write([]string{
			fmt.Sprint(l.ID),
			l.ActorName,
			l.Action,
			l.EntityType,
			fmt.Sprint(l.EntityID),
			l.Details,
			l.CreatedAt.Format(time.RFC3339),
		})
	}
	w.Flush()
	return nil
}

// ExportPlayers GET /api/v1/admin/export/players.csv — admin only
func ExportPlayers(c echo.Context) error {
	type playerRow struct {
		PlayerName   string
		TotalSeconds int64
		Sessions     int64
		LastSeen     *time.Time
	}

	var rows []playerRow
	database.DB.Model(&models.PlayerSession{}).
		Select("player_name, SUM(duration) as total_seconds, COUNT(*) as sessions, MAX(ended_at) as last_seen").
		Where("ended_at IS NOT NULL").
		Group("player_name").
		Order("total_seconds DESC").
		Limit(1000).
		Scan(&rows)

	c.Response().Header().Set("Content-Type", "text/csv; charset=utf-8")
	c.Response().Header().Set("Content-Disposition", "attachment; filename=players.csv")
	c.Response().WriteHeader(http.StatusOK)

	w := csv.NewWriter(c.Response().Writer)
	_ = w.Write([]string{"Player", "Total Seconds", "Sessions", "Last Seen"})

	for _, r := range rows {
		lastSeen := ""
		if r.LastSeen != nil {
			lastSeen = r.LastSeen.Format(time.RFC3339)
		}
		_ = w.Write([]string{
			r.PlayerName,
			fmt.Sprint(r.TotalSeconds),
			fmt.Sprint(r.Sessions),
			lastSeen,
		})
	}
	w.Flush()
	return nil
}
