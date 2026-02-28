package api

import (
	"encoding/base64"
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
			"vrising_map_enabled":  true,
			"vrising_map_url":      "/vrising-map.png",
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
		"vrising_map_enabled":  s.VRisingMapEnabled,
		"vrising_map_url":      effectiveVRisingMapURL(s),
		"vrising_world_x_min":  effectiveWorldBound(s.VRisingWorldXMin, -2880),
		"vrising_world_x_max":  effectiveWorldBound(s.VRisingWorldXMax, 160),
		"vrising_world_z_min":  effectiveWorldBound(s.VRisingWorldZMin, -2400),
		"vrising_world_z_max":  effectiveWorldBound(s.VRisingWorldZMax, 640),
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
		"discord_refresh_interval":    s.DiscordRefreshInterval,
		"vrising_map_enabled":         s.VRisingMapEnabled,
		"vrising_map_url":             s.VRisingMapURL,
		"vrising_map_image_set":       s.VRisingMapImage != "",
		"vrising_world_x_min":         effectiveWorldBound(s.VRisingWorldXMin, -2880),
		"vrising_world_x_max":         effectiveWorldBound(s.VRisingWorldXMax, 160),
		"vrising_world_z_min":         effectiveWorldBound(s.VRisingWorldZMin, -2400),
		"vrising_world_z_max":         effectiveWorldBound(s.VRisingWorldZMax, 640),
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
		DiscordRefreshInterval  int    `json:"discord_refresh_interval"`
		VRisingMapEnabled       *bool  `json:"vrising_map_enabled"`
		VRisingMapURL           string `json:"vrising_map_url"`
		VRisingMapImage         string `json:"vrising_map_image"` // "" = no change, "__CLEAR__" = delete, "data:..." = save
		VRisingWorldXMin        *int   `json:"vrising_world_x_min"`
		VRisingWorldXMax        *int   `json:"vrising_world_x_max"`
		VRisingWorldZMin        *int   `json:"vrising_world_z_min"`
		VRisingWorldZMax        *int   `json:"vrising_world_z_max"`
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
	s.VRisingMapURL = payload.VRisingMapURL
	if payload.VRisingMapEnabled != nil {
		s.VRisingMapEnabled = *payload.VRisingMapEnabled
	}
	if payload.VRisingWorldXMin != nil { s.VRisingWorldXMin = *payload.VRisingWorldXMin }
	if payload.VRisingWorldXMax != nil { s.VRisingWorldXMax = *payload.VRisingWorldXMax }
	if payload.VRisingWorldZMin != nil { s.VRisingWorldZMin = *payload.VRisingWorldZMin }
	if payload.VRisingWorldZMax != nil { s.VRisingWorldZMax = *payload.VRisingWorldZMax }
	switch payload.VRisingMapImage {
	case "":
		// no change
	case "__CLEAR__":
		s.VRisingMapImage = ""
	default:
		if len(payload.VRisingMapImage) > 10_000_000 { // 10 MB base64 limit
			return c.JSON(http.StatusBadRequest, echo.Map{"error": "map image too large (max 10 MB)"})
		}
		s.VRisingMapImage = payload.VRisingMapImage
	}
	if payload.DiscordRefreshInterval >= 10 {
		s.DiscordRefreshInterval = payload.DiscordRefreshInterval
	} else if payload.DiscordRefreshInterval == 0 && s.DiscordRefreshInterval == 0 {
		s.DiscordRefreshInterval = 60
	}

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

// GetLogo GET /api/v1/logo — public
// Serves the site logo stored as base64 data URL. Used as Discord embed footer icon.
func GetLogo(c echo.Context) error {
	var s models.SiteSettings
	if database.DB.First(&s, 1).Error != nil || s.LogoData == "" {
		return c.NoContent(http.StatusNotFound)
	}

	// Expected format: "data:<mime>;base64,<data>"
	comma := strings.Index(s.LogoData, ",")
	if comma < 0 {
		return c.NoContent(http.StatusNotFound)
	}
	header := s.LogoData[:comma]    // "data:image/webp;base64"
	encoded := s.LogoData[comma+1:] // base64 payload

	mime := "image/png"
	if semi := strings.Index(header, ";"); semi > 5 {
		mime = header[5:semi] // strip "data:"
	}

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return c.NoContent(http.StatusInternalServerError)
	}

	c.Response().Header().Set("Cache-Control", "public, max-age=300")
	return c.Blob(http.StatusOK, mime, data)
}

// effectiveWorldBound returns the stored value if non-zero, otherwise the default.
// GORM stores int as 0 when unset; a zero bound is invalid for V Rising world coordinates,
// so we treat 0 as "not set" and fall back to the known default.
func effectiveWorldBound(stored, def int) int {
	if stored != 0 {
		return stored
	}
	return def
}

// effectiveVRisingMapURL returns the URL to serve as vrising_map_url in public settings.
// If a custom URL is set, it wins. If an uploaded image exists, returns the API endpoint.
// Otherwise returns the default static path.
func effectiveVRisingMapURL(s models.SiteSettings) string {
	if s.VRisingMapURL != "" {
		return s.VRisingMapURL
	}
	if s.VRisingMapImage != "" {
		return "/api/v1/vrising/map-image"
	}
	return "/vrising-map.png"
}

// GetVRisingMapImage GET /api/v1/vrising/map-image — public
// Serves the Vardoran map image uploaded via admin settings.
func GetVRisingMapImage(c echo.Context) error {
	var s models.SiteSettings
	if database.DB.First(&s, 1).Error != nil || s.VRisingMapImage == "" {
		return c.NoContent(http.StatusNotFound)
	}

	comma := strings.Index(s.VRisingMapImage, ",")
	if comma < 0 {
		return c.NoContent(http.StatusNotFound)
	}
	header := s.VRisingMapImage[:comma]
	encoded := s.VRisingMapImage[comma+1:]

	mime := "image/png"
	if semi := strings.Index(header, ";"); semi > 5 {
		mime = header[5:semi]
	}

	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return c.NoContent(http.StatusInternalServerError)
	}

	c.Response().Header().Set("Cache-Control", "public, max-age=3600")
	return c.Blob(http.StatusOK, mime, data)
}
