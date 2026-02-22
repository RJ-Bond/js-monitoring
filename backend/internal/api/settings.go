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
			"id":            1,
			"site_name":     "JSMonitor",
			"logo_data":     "",
			"steam_enabled": envKey != "",
			"app_url":       "",
		})
	}
	effectiveKey := s.SteamAPIKey
	if effectiveKey == "" {
		effectiveKey = os.Getenv("STEAM_API_KEY")
	}
	return c.JSON(http.StatusOK, echo.Map{
		"id":            s.ID,
		"site_name":     s.SiteName,
		"logo_data":     s.LogoData,
		"steam_enabled": effectiveKey != "",
		"app_url":       s.AppURL,
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

	return c.JSON(http.StatusOK, echo.Map{
		"id":               s.ID,
		"site_name":        s.SiteName,
		"logo_data":        s.LogoData,
		"app_url":          s.AppURL,
		"steam_key_set":    effectiveKey != "",
		"steam_key_hint":   hint,
		"steam_key_source": keySource,
	})
}

// UpdateSettings PUT /api/v1/admin/settings — admin only
func UpdateSettings(c echo.Context) error {
	var payload struct {
		SiteName    string `json:"site_name"`
		LogoData    string `json:"logo_data"`
		AppURL      string `json:"app_url"`
		SteamAPIKey string `json:"steam_api_key"` // "" = no change, "__CLEAR__" = delete, otherwise = save
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

	switch payload.SteamAPIKey {
	case "":
		// no change
	case "__CLEAR__":
		s.SteamAPIKey = ""
	default:
		s.SteamAPIKey = payload.SteamAPIKey
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
		"id":            s.ID,
		"site_name":     s.SiteName,
		"logo_data":     s.LogoData,
		"steam_enabled": effectiveKey != "",
		"app_url":       s.AppURL,
	})
}
