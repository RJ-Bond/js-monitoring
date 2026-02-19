package api

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// AdminGetUsers GET /api/v1/admin/users — list all users (admin only)
func AdminGetUsers(c echo.Context) error {
	var users []models.User
	if err := database.DB.Order("created_at ASC").Find(&users).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, users)
}

// AdminUpdateUser PUT /api/v1/admin/users/:id — ban/unban or change role
func AdminUpdateUser(c echo.Context) error {
	id := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	var payload struct {
		Role   *string `json:"role"`
		Banned *bool   `json:"banned"`
	}
	if err := c.Bind(&payload); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}

	// Prevent self-demotion / self-ban
	callerID := uint(0)
	if v, ok := c.Get("user_id").(float64); ok {
		callerID = uint(v)
	}
	if callerID == user.ID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "cannot modify your own account"})
	}

	updates := map[string]interface{}{}
	if payload.Role != nil {
		updates["role"] = *payload.Role
	}
	if payload.Banned != nil {
		updates["banned"] = *payload.Banned
	}
	if len(updates) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "no fields to update"})
	}

	if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	database.DB.First(&user, id)
	return c.JSON(http.StatusOK, user)
}

// AdminDeleteUser DELETE /api/v1/admin/users/:id
func AdminDeleteUser(c echo.Context) error {
	id := c.Param("id")

	callerID := uint(0)
	if v, ok := c.Get("user_id").(float64); ok {
		callerID = uint(v)
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if callerID == user.ID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "cannot delete your own account"})
	}

	database.DB.Delete(&user)
	return c.JSON(http.StatusOK, echo.Map{"message": "user deleted"})
}
