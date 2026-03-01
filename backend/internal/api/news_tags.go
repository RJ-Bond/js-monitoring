package api

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GetNewsTags GET /api/v1/news/tags — public
func GetNewsTags(c echo.Context) error {
	var tags []models.NewsTag
	database.DB.Order("name ASC").Find(&tags)
	return c.JSON(http.StatusOK, tags)
}

// CreateNewsTag POST /api/v1/admin/news/tags
func CreateNewsTag(c echo.Context) error {
	var body struct {
		Name string `json:"name"`
		Icon string `json:"icon"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid payload"})
	}
	if body.Name == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "name is required"})
	}

	tag := models.NewsTag{Name: body.Name, Icon: body.Icon}
	if err := database.DB.Create(&tag).Error; err != nil {
		return c.JSON(http.StatusConflict, echo.Map{"error": "tag already exists"})
	}
	return c.JSON(http.StatusCreated, tag)
}

// UpdateNewsTag PUT /api/v1/admin/news/tags/:id
func UpdateNewsTag(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid id"})
	}

	var tag models.NewsTag
	if database.DB.First(&tag, id).Error != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "tag not found"})
	}

	var body struct {
		Name string `json:"name"`
		Icon string `json:"icon"`
	}
	if err := c.Bind(&body); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid payload"})
	}
	if body.Name != "" {
		tag.Name = body.Name
	}
	tag.Icon = body.Icon
	database.DB.Save(&tag)
	return c.JSON(http.StatusOK, tag)
}

// DeleteNewsTag DELETE /api/v1/admin/news/tags/:id
func DeleteNewsTag(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid id"})
	}
	database.DB.Delete(&models.NewsTag{}, id)
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}
