package api

import (
	"net/http"
	"os"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// maskKey returns the last 4 chars of the key prefixed with asterisks.
func maskKey(key string) string {
	if len(key) <= 4 {
		return strings.Repeat("*", len(key))
	}
	return strings.Repeat("*", len(key)-4) + key[len(key)-4:]
}

// GetSettings GET /api/v1/settings — public
// Returns site appearance settings + steam_enabled flag (no secret key).
func GetSettings(c echo.Context) error {
	var s models.SiteSettings
	if err := database.DB.First(&s, 1).Error; err != nil {
		envKey := os.Getenv("STEAM_API_KEY")
		return c.JSON(http.StatusOK, echo.Map{
			"id":                   1,
			"site_name":            "JSMonitor",
			"logo_data":            "",
			"steam_enabled":        envKey != "",
			"app_url":              "",
			"registration_enabled": true,
		})
	}
	effectiveKey := s.SteamAPIKey
	if effectiveKey == "" {
		effectiveKey = os.Getenv("STEAM_API_KEY")
	}
	dt := s.DefaultTheme
	if dt == "" {
		dt = "dark"
	}
	return c.JSON(http.StatusOK, echo.Map{
		"id":                   s.ID,
		"site_name":            s.SiteName,
		"logo_data":            s.LogoData,
		"steam_enabled":        effectiveKey != "",
		"app_url":              s.AppURL,
		"registration_enabled": s.RegistrationEnabled,
		"force_https":          s.ForceHTTPS,
		"default_theme":        dt,
	})
}

// GetAdminSettings GET /api/v1/admin/settings — admin only
// Returns full settings including masked Steam key hint.
func GetAdminSettings(c echo.Context) error {
	var s models.SiteSettings
	if database.DB.First(&s, 1).Error != nil {
		s = models.SiteSettings{ID: 1, SiteName: "JSMonitor"}
	}
	dbKey := s.SteamAPIKey
	envKey := os.Getenv("STEAM_API_KEY")

	effectiveKey := dbKey
	keySource := "db"
	if effectiveKey == "" {
		effectiveKey = envKey
		keySource = "env"
	}

	hint := ""
	if effectiveKey != "" {
		hint = maskKey(effectiveKey)
	}

	adt := s.DefaultTheme
	if adt == "" {
		adt = "dark"
	}
	return c.JSON(http.StatusOK, echo.Map{
		"id":                    s.ID,
		"site_name":             s.SiteName,
		"logo_data":             s.LogoData,
		"app_url":               s.AppURL,
		"steam_key_set":         effectiveKey != "",
		"steam_key_hint":        hint,
		"steam_key_source":      keySource,
		"registration_enabled":  s.RegistrationEnabled,
		"news_webhook_url":      s.NewsWebhookURL,
		"news_role_id":          s.NewsRoleID,
		"news_tg_bot_token":     s.NewsTGBotToken,
		"news_tg_chat_id":       s.NewsTGChatID,
		"news_tg_thread_id":     s.NewsTGThreadID,
		"ssl_mode":              s.SSLMode,
		"ssl_domain":            s.SSLDomain,
		"force_https":           s.ForceHTTPS,
		"default_theme":         adt,
		"discord_app_id":        s.DiscordAppID,
		"discord_bot_token_set": s.DiscordBotToken != "",
		"discord_proxy":         s.DiscordProxy,
		"discord_embed_config":        s.DiscordEmbedConfig,
		"discord_alert_channel_id":    s.DiscordAlertChannelID,
	})
}

// UpdateSettings PUT /api/v1/admin/settings — admin only
func UpdateSettings(c echo.Context) error {
	var payload struct {
		SiteName            string `json:"site_name"`
		LogoData            string `json:"logo_data"`
		AppURL              string `json:"app_url"`
		SteamAPIKey         string `json:"steam_api_key"` // "" = no change, "__CLEAR__" = delete, otherwise = save
		RegistrationEnabled *bool  `json:"registration_enabled"`
		NewsWebhookURL      string `json:"news_webhook_url"`
		NewsRoleID          string `json:"news_role_id"`
		NewsTGBotToken      string `json:"news_tg_bot_token"`
		NewsTGChatID        string `json:"news_tg_chat_id"`
		NewsTGThreadID      string `json:"news_tg_thread_id"`
		ForceHTTPS          *bool  `json:"force_https"`
		DefaultTheme        string `json:"default_theme"`
		DiscordBotToken     string `json:"discord_bot_token"` // "" = no change, "__CLEAR__" = delete
		DiscordAppID        string `json:"discord_app_id"`
		DiscordProxy        string `json:"discord_proxy"`
		DiscordEmbedConfig      string `json:"discord_embed_config"`
		DiscordAlertChannelID   string `json:"discord_alert_channel_id"`
	}
	if err := c.Bind(&payload); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid payload"})
	}
	if payload.SiteName == "" {
		payload.SiteName = "JSMonitor"
	}
	if len(payload.LogoData) > 500_000 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "logo too large"})
	}

	var s models.SiteSettings
	if database.DB.First(&s, 1).Error != nil {
		s = models.SiteSettings{ID: 1}
	}
	s.SiteName = payload.SiteName
	s.LogoData = payload.LogoData
	s.AppURL = payload.AppURL
	s.NewsWebhookURL = payload.NewsWebhookURL
	s.NewsRoleID = payload.NewsRoleID
	s.NewsTGBotToken = payload.NewsTGBotToken
	s.NewsTGChatID = payload.NewsTGChatID
	s.NewsTGThreadID = payload.NewsTGThreadID
	if payload.DefaultTheme == "light" || payload.DefaultTheme == "system" {
		s.DefaultTheme = payload.DefaultTheme
	} else {
		s.DefaultTheme = "dark"
	}
	if payload.RegistrationEnabled != nil {
		s.RegistrationEnabled = *payload.RegistrationEnabled
	}
	if payload.ForceHTTPS != nil {
		s.ForceHTTPS = *payload.ForceHTTPS
	}

	switch payload.SteamAPIKey {
	case "":
		// no change
	case "__CLEAR__":
		s.SteamAPIKey = ""
	default:
		s.SteamAPIKey = payload.SteamAPIKey
	}

	switch payload.DiscordBotToken {
	case "":
		// no change
	case "__CLEAR__":
		s.DiscordBotToken = ""
	default:
		s.DiscordBotToken = payload.DiscordBotToken
	}
	s.DiscordAppID = payload.DiscordAppID
	s.DiscordProxy = payload.DiscordProxy
	if payload.DiscordEmbedConfig != "" {
		s.DiscordEmbedConfig = payload.DiscordEmbedConfig
	}
	s.DiscordAlertChannelID = payload.DiscordAlertChannelID

	database.DB.Save(&s)
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "update_settings", "settings", 1, s.SiteName)
	}

	effectiveKey := s.SteamAPIKey
	if effectiveKey == "" {
		effectiveKey = os.Getenv("STEAM_API_KEY")
	}
	return c.JSON(http.StatusOK, echo.Map{
		"id":                   s.ID,
		"site_name":            s.SiteName,
		"logo_data":            s.LogoData,
		"steam_enabled":        effectiveKey != "",
		"app_url":              s.AppURL,
		"registration_enabled": s.RegistrationEnabled,
		"news_webhook_url":     s.NewsWebhookURL,
		"news_role_id":         s.NewsRoleID,
		"news_tg_bot_token":    s.NewsTGBotToken,
		"news_tg_chat_id":      s.NewsTGChatID,
		"news_tg_thread_id":    s.NewsTGThreadID,
	})
}
