package api

import (
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GetSessions GET /api/v1/profile/sessions — возвращает активные сессии пользователя
func GetSessions(c echo.Context) error {
	uid := uint(c.Get("user_id").(float64))

	var sessions []models.UserSession
	database.DB.Where("user_id = ? AND expires_at > ?", uid, time.Now()).
		Order("last_used_at DESC").
		Find(&sessions)

	return c.JSON(http.StatusOK, sessions)
}

// DeleteSession DELETE /api/v1/profile/sessions/:id — удаляет одну сессию
func DeleteSession(c echo.Context) error {
	uid := uint(c.Get("user_id").(float64))
	id := c.Param("id")

	result := database.DB.Where("id = ? AND user_id = ?", id, uid).Delete(&models.UserSession{})
	if result.RowsAffected == 0 {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "session not found"})
	}
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// DeleteAllSessions DELETE /api/v1/profile/sessions — разлогинивает все устройства
// Устанавливает SessionsClearedAt = now() и выдаёт новый токен для текущего устройства.
func DeleteAllSessions(c echo.Context) error {
	uid := uint(c.Get("user_id").(float64))

	now := time.Now()
	database.DB.Model(&models.User{}).Where("id = ?", uid).Update("sessions_cleared_at", now)
	database.DB.Where("user_id = ?", uid).Delete(&models.UserSession{})

	var user models.User
	if err := database.DB.First(&user, uid).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "user not found"})
	}

	jti := uuid.New().String()
	expiry := time.Now().Add(7 * 24 * time.Hour)
	claims := jwt.MapClaims{
		"sub":      user.ID,
		"username": user.Username,
		"role":     user.Role,
		"jti":      jti,
		"exp":      expiry.Unix(),
		"iat":      time.Now().Unix(),
	}
	tk := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, err := tk.SignedString(jwtSecret())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token generation failed"})
	}

	createSession(user.ID, jti, c.Request().UserAgent(), c.RealIP(), expiry)

	return c.JSON(http.StatusOK, echo.Map{"token": token})
}
