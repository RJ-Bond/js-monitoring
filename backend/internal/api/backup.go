package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

const backupFormatVersion = "1"

// ─── Backup-specific structs (expose all fields, including json:"-" ones) ─────

type bkSettings struct {
	ID                  uint   `json:"id"`
	SiteName            string `json:"site_name"`
	LogoData            string `json:"logo_data"`
	SteamAPIKey         string `json:"steam_api_key"`
	AppURL              string `json:"app_url"`
	RegistrationEnabled bool   `json:"registration_enabled"`
	NewsWebhookURL      string `json:"news_webhook_url"`
	NewsRoleID          string `json:"news_role_id"`
	NewsTGBotToken      string `json:"news_tg_bot_token"`
	NewsTGChatID        string `json:"news_tg_chat_id"`
	NewsTGThreadID      string `json:"news_tg_thread_id"`
	SSLMode             string `json:"ssl_mode"`
	SSLDomain           string `json:"ssl_domain"`
	ForceHTTPS          bool   `json:"force_https"`
	DefaultTheme        string `json:"default_theme"`
	DiscordBotToken     string `json:"discord_bot_token"`
	DiscordAppID        string `json:"discord_app_id"`
	DiscordProxy        string `json:"discord_proxy"`
}

type bkUser struct {
	ID                uint       `gorm:"column:id"                  json:"id"`
	Username          string     `gorm:"column:username"            json:"username"`
	Email             *string    `gorm:"column:email"               json:"email"`
	PasswordHash      string     `gorm:"column:password_hash"       json:"password_hash"`
	SteamID           *string    `gorm:"column:steam_id"            json:"steam_id"`
	Avatar            string     `gorm:"column:avatar"              json:"avatar"`
	APIToken          *string    `gorm:"column:api_token"           json:"api_token"`
	Role              string     `gorm:"column:role"                json:"role"`
	Banned            bool       `gorm:"column:banned"              json:"banned"`
	TOTPSecret        string     `gorm:"column:totp_secret"         json:"totp_secret"`
	TOTPEnabled       bool       `gorm:"column:totp_enabled"        json:"totp_enabled"`
	SessionsClearedAt *time.Time `gorm:"column:sessions_cleared_at" json:"sessions_cleared_at"`
	DeleteScheduledAt *time.Time `gorm:"column:delete_scheduled_at" json:"delete_scheduled_at"`
	CreatedAt         time.Time  `gorm:"column:created_at"          json:"created_at"`
	UpdatedAt         time.Time  `gorm:"column:updated_at"          json:"updated_at"`
}

type bkServer struct {
	ID          uint      `gorm:"column:id"           json:"id"`
	UUID        string    `gorm:"column:uuid"         json:"uuid"`
	Title       string    `gorm:"column:title"        json:"title"`
	IP          string    `gorm:"column:ip"           json:"ip"`
	DisplayIP   string    `gorm:"column:display_ip"   json:"display_ip"`
	Port        uint16    `gorm:"column:port"         json:"port"`
	GameType    string    `gorm:"column:game_type"    json:"game_type"`
	SecretRCON  string    `gorm:"column:secret_rcon"  json:"secret_rcon"`
	CountryCode string    `gorm:"column:country_code" json:"country_code"`
	CountryName string    `gorm:"column:country_name" json:"country_name"`
	OwnerID     uint      `gorm:"column:owner_id"     json:"owner_id"`
	CreatedAt   time.Time `gorm:"column:created_at"   json:"created_at"`
	UpdatedAt   time.Time `gorm:"column:updated_at"   json:"updated_at"`
}

// BackupPayload is the top-level structure written to / read from a backup file.
type BackupPayload struct {
	Version        string                 `json:"version"`
	ExportedAt     time.Time              `json:"exported_at"`
	Settings       *bkSettings            `json:"settings,omitempty"`
	Users          []bkUser               `json:"users"`
	Servers        []bkServer             `json:"servers"`
	AlertConfigs   []models.AlertsConfig  `json:"alert_configs"`
	DiscordConfigs []models.DiscordConfig `json:"discord_configs"`
	News           []models.NewsItem      `json:"news"`
}

// GetBackup GET /api/v1/admin/backup
// Returns a JSON file containing all site data. The response is an attachment.
func GetBackup(c echo.Context) error {
	db := database.DB

	var p BackupPayload
	p.Version = backupFormatVersion
	p.ExportedAt = time.Now().UTC()

	// Site settings — read via GORM (fills json:"-" fields too)
	var s models.SiteSettings
	if db.First(&s, 1).Error == nil {
		p.Settings = &bkSettings{
			ID:                  s.ID,
			SiteName:            s.SiteName,
			LogoData:            s.LogoData,
			SteamAPIKey:         s.SteamAPIKey,
			AppURL:              s.AppURL,
			RegistrationEnabled: s.RegistrationEnabled,
			NewsWebhookURL:      s.NewsWebhookURL,
			NewsRoleID:          s.NewsRoleID,
			NewsTGBotToken:      s.NewsTGBotToken,
			NewsTGChatID:        s.NewsTGChatID,
			NewsTGThreadID:      s.NewsTGThreadID,
			SSLMode:             s.SSLMode,
			SSLDomain:           s.SSLDomain,
			ForceHTTPS:          s.ForceHTTPS,
			DefaultTheme:        s.DefaultTheme,
			DiscordBotToken:     s.DiscordBotToken,
			DiscordAppID:        s.DiscordAppID,
			DiscordProxy:        s.DiscordProxy,
		}
	}

	// Users — raw scan to include password_hash and totp_secret
	db.Raw("SELECT id, username, email, password_hash, steam_id, avatar, api_token, role, banned, totp_secret, totp_enabled, sessions_cleared_at, delete_scheduled_at, created_at, updated_at FROM users").Scan(&p.Users)

	// Servers — raw scan to include secret_rcon
	db.Raw("SELECT id, uuid, title, ip, display_ip, port, game_type, secret_rcon, country_code, country_name, owner_id, created_at, updated_at FROM servers").Scan(&p.Servers)

	db.Find(&p.AlertConfigs)
	db.Find(&p.DiscordConfigs)
	db.Find(&p.News)

	filename := fmt.Sprintf("jsmon-backup-%s.json", time.Now().Format("2006-01-02"))
	c.Response().Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	return c.JSON(http.StatusOK, p)
}

// RestoreBackup POST /api/v1/admin/restore
// Accepts a JSON backup, wipes current data, and restores from the file.
func RestoreBackup(c echo.Context) error {
	c.Request().Body = http.MaxBytesReader(c.Response().Writer, c.Request().Body, 100<<20) // 100 MB limit

	var p BackupPayload
	if err := json.NewDecoder(c.Request().Body).Decode(&p); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid backup file: " + err.Error()})
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		tx.Exec("SET FOREIGN_KEY_CHECKS=0")
		defer tx.Exec("SET FOREIGN_KEY_CHECKS=1")

		for _, stmt := range []string{
			"DELETE FROM user_sessions",
			"DELETE FROM password_resets",
			"DELETE FROM alerts_configs",
			"DELETE FROM discord_configs",
			"DELETE FROM news_items",
			"DELETE FROM server_statuses",
			"DELETE FROM player_histories",
			"DELETE FROM player_sessions",
			"DELETE FROM audit_logs",
			"DELETE FROM servers",
			"DELETE FROM users",
			"DELETE FROM site_settings",
		} {
			if err := tx.Exec(stmt).Error; err != nil {
				return fmt.Errorf("clear %s: %w", stmt, err)
			}
		}

		// Site settings
		if p.Settings != nil {
			s := models.SiteSettings{
				ID:                  p.Settings.ID,
				SiteName:            p.Settings.SiteName,
				LogoData:            p.Settings.LogoData,
				SteamAPIKey:         p.Settings.SteamAPIKey,
				AppURL:              p.Settings.AppURL,
				RegistrationEnabled: p.Settings.RegistrationEnabled,
				NewsWebhookURL:      p.Settings.NewsWebhookURL,
				NewsRoleID:          p.Settings.NewsRoleID,
				NewsTGBotToken:      p.Settings.NewsTGBotToken,
				NewsTGChatID:        p.Settings.NewsTGChatID,
				NewsTGThreadID:      p.Settings.NewsTGThreadID,
				SSLMode:             p.Settings.SSLMode,
				SSLDomain:           p.Settings.SSLDomain,
				ForceHTTPS:          p.Settings.ForceHTTPS,
				DefaultTheme:        p.Settings.DefaultTheme,
				DiscordBotToken:     p.Settings.DiscordBotToken,
				DiscordAppID:        p.Settings.DiscordAppID,
				DiscordProxy:        p.Settings.DiscordProxy,
			}
			if err := tx.Create(&s).Error; err != nil {
				return fmt.Errorf("settings: %w", err)
			}
		}

		// Users
		for _, u := range p.Users {
			err := tx.Exec(
				`INSERT INTO users (id,username,email,password_hash,steam_id,avatar,api_token,role,banned,totp_secret,totp_enabled,sessions_cleared_at,delete_scheduled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				u.ID, u.Username, u.Email, u.PasswordHash, u.SteamID, u.Avatar, u.APIToken,
				u.Role, u.Banned, u.TOTPSecret, u.TOTPEnabled,
				u.SessionsClearedAt, u.DeleteScheduledAt, u.CreatedAt, u.UpdatedAt,
			).Error
			if err != nil {
				return fmt.Errorf("user %d: %w", u.ID, err)
			}
		}

		// Servers
		for _, s := range p.Servers {
			err := tx.Exec(
				`INSERT INTO servers (id,uuid,title,ip,display_ip,port,game_type,secret_rcon,country_code,country_name,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
				s.ID, s.UUID, s.Title, s.IP, s.DisplayIP, s.Port, s.GameType, s.SecretRCON,
				s.CountryCode, s.CountryName, s.OwnerID, s.CreatedAt, s.UpdatedAt,
			).Error
			if err != nil {
				return fmt.Errorf("server %d: %w", s.ID, err)
			}
		}

		// AlertsConfigs
		for i := range p.AlertConfigs {
			if err := tx.Create(&p.AlertConfigs[i]).Error; err != nil {
				return fmt.Errorf("alert config %d: %w", p.AlertConfigs[i].ID, err)
			}
		}

		// DiscordConfigs
		for i := range p.DiscordConfigs {
			if err := tx.Create(&p.DiscordConfigs[i]).Error; err != nil {
				return fmt.Errorf("discord config %d: %w", p.DiscordConfigs[i].ID, err)
			}
		}

		// News
		for i := range p.News {
			if err := tx.Create(&p.News[i]).Error; err != nil {
				return fmt.Errorf("news %d: %w", p.News[i].ID, err)
			}
		}

		return nil
	})

	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	aid, aname := actorFromCtx(c)
	logAudit(aid, aname, "restore_backup", "system", 0,
		fmt.Sprintf("exported_at=%s users=%d servers=%d news=%d",
			p.ExportedAt.Format(time.RFC3339), len(p.Users), len(p.Servers), len(p.News)))

	return c.JSON(http.StatusOK, echo.Map{
		"message": "backup restored successfully",
		"users":   len(p.Users),
		"servers": len(p.Servers),
		"news":    len(p.News),
	})
}
