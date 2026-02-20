package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GetSettings GET /api/v1/settings — public
func GetSettings(c echo.Context) error {
	var s models.SiteSettings
	if err := database.DB.First(&s, 1).Error; err != nil {
		return c.JSON(http.StatusOK, models.SiteSettings{ID: 1, SiteName: "JSMonitor"})
	}
	return c.JSON(http.StatusOK, s)
}

// UpdateSettings PUT /api/v1/admin/settings — admin only
func UpdateSettings(c echo.Context) error {
	var payload struct {
		SiteName string `json:"site_name"`
		LogoData string `json:"logo_data"`
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
	database.DB.Save(&s)
	return c.JSON(http.StatusOK, s)
}
