package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// ── Internal helpers (called from PushVRisingMap) ─────────────────────────────

// syncBans replaces the stored ban list for a server with what the plugin reported.
func syncBans(serverID uint, bans []VRisingBanPayload) {
	if len(bans) == 0 {
		// Plugin reported empty list → clear all bans for this server
		database.DB.Where("server_id = ?", serverID).Delete(&models.VRisingBan{})
		return
	}

	// Upsert each ban (insert or update by server_id + steam_id)
	for _, b := range bans {
		var bannedAt time.Time
		if b.BannedAt > 0 {
			bannedAt = time.Unix(b.BannedAt, 0)
		} else {
			bannedAt = time.Now()
		}
		var expiresAt *time.Time
		if b.ExpiresAt != nil {
			t := time.Unix(*b.ExpiresAt, 0)
			expiresAt = &t
		}

		var existing models.VRisingBan
		res := database.DB.Where("server_id = ? AND steam_id = ?", serverID, b.SteamID).First(&existing)
		if res.Error != nil {
			database.DB.Create(&models.VRisingBan{
				ServerID:  serverID,
				SteamID:   b.SteamID,
				Name:      b.Name,
				Reason:    b.Reason,
				BannedBy:  b.BannedBy,
				BannedAt:  bannedAt,
				ExpiresAt: expiresAt,
			})
		} else {
			database.DB.Model(&existing).Updates(map[string]interface{}{
				"name":       b.Name,
				"reason":     b.Reason,
				"banned_by":  b.BannedBy,
				"banned_at":  bannedAt,
				"expires_at": expiresAt,
			})
		}
	}

	// Remove any bans in DB that are no longer in plugin's list
	steamIDs := make([]string, len(bans))
	for i, b := range bans {
		steamIDs[i] = b.SteamID
	}
	database.DB.Where("server_id = ? AND steam_id NOT IN ?", serverID, steamIDs).
		Delete(&models.VRisingBan{})
}

// fetchAndAckCommands returns pending commands for the server and marks them executed.
func fetchAndAckCommands(serverID uint) []map[string]interface{} {
	var cmds []models.VRisingModCommand
	database.DB.Where("server_id = ? AND executed_at IS NULL", serverID).
		Order("id ASC").Find(&cmds)

	if len(cmds) == 0 {
		return nil
	}

	result := make([]map[string]interface{}, 0, len(cmds))
	now := time.Now()
	ids := make([]uint, 0, len(cmds))

	for _, cmd := range cmds {
		result = append(result, map[string]interface{}{
			"id":               cmd.ID,
			"type":             cmd.Type,
			"player_name":      cmd.PlayerName,
			"steam_id":         cmd.SteamID,
			"reason":           cmd.Reason,
			"duration_seconds": cmd.DurationSeconds,
		})
		ids = append(ids, cmd.ID)
	}

	database.DB.Model(&models.VRisingModCommand{}).Where("id IN ?", ids).
		Update("executed_at", now)

	return result
}

// ── Admin API endpoints ───────────────────────────────────────────────────────

// GetVRisingBans GET /api/v1/admin/vrising/:serverID/bans
func GetVRisingBans(c echo.Context) error {
	serverID, err := strconv.Atoi(c.Param("serverID"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid server id"})
	}

	var bans []models.VRisingBan
	database.DB.Where("server_id = ?", serverID).Order("banned_at DESC").Find(&bans)
	return c.JSON(http.StatusOK, bans)
}

// QueueVRisingModCommand POST /api/v1/admin/vrising/:serverID/mod-command
// Body: { "type":"kick"|"ban"|"unban", "player_name":"...", "steam_id":"...", "reason":"...", "duration_seconds":0 }
func QueueVRisingModCommand(c echo.Context) error {
	serverID, err := strconv.Atoi(c.Param("serverID"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid server id"})
	}

	var body struct {
		Type            string `json:"type"`
		PlayerName      string `json:"player_name"`
		SteamID         string `json:"steam_id"`
		Reason          string `json:"reason"`
		DurationSeconds int64  `json:"duration_seconds"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid body"})
	}
	if body.Type != "kick" && body.Type != "ban" && body.Type != "unban" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "type must be kick|ban|unban"})
	}

	issuedBy, _ := c.Get("username").(string)

	cmd := models.VRisingModCommand{
		ServerID:        uint(serverID),
		Type:            body.Type,
		PlayerName:      body.PlayerName,
		SteamID:         body.SteamID,
		Reason:          body.Reason,
		DurationSeconds: body.DurationSeconds,
		IssuedBy:        issuedBy,
	}
	database.DB.Create(&cmd)

	return c.JSON(http.StatusOK, echo.Map{"ok": true, "id": cmd.ID})
}

// UnbanVRisingPlayer DELETE /api/v1/admin/vrising/:serverID/bans/:steamID
// Queues an unban command AND removes the ban record immediately.
func UnbanVRisingPlayer(c echo.Context) error {
	serverID, err := strconv.Atoi(c.Param("serverID"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid server id"})
	}
	steamID := c.Param("steamID")
	if steamID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "steam_id required"})
	}

	issuedBy, _ := c.Get("username").(string)

	// Remove from DB immediately
	database.DB.Where("server_id = ? AND steam_id = ?", serverID, steamID).
		Delete(&models.VRisingBan{})

	// Queue unban command so plugin removes it from bans.json too
	database.DB.Create(&models.VRisingModCommand{
		ServerID:   uint(serverID),
		Type:       "unban",
		SteamID:    steamID,
		IssuedBy:   issuedBy,
	})

	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}
