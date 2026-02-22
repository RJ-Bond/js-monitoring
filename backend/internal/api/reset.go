package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GenerateResetToken POST /api/v1/admin/users/:id/reset-token
// Генерирует одноразовую ссылку сброса пароля (только для администратора).
func GenerateResetToken(c echo.Context) error {
	userID := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	// Инвалидируем старые токены
	database.DB.Model(&models.PasswordReset{}).
		Where("user_id = ? AND used = ?", user.ID, false).
		Update("used", true)

	// Генерируем 32-байтный токен
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to generate token"})
	}
	token := hex.EncodeToString(b)

	reset := models.PasswordReset{
		UserID:    user.ID,
		Token:     token,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := database.DB.Create(&reset).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to save token"})
	}

	// Формируем ссылку
	var settings models.SiteSettings
	database.DB.First(&settings, 1)
	base := strings.TrimRight(settings.AppURL, "/")
	if base == "" {
		base = "http://localhost:3000"
	}
	link := base + "/reset-password?token=" + token

	aid, aname := actorFromCtx(c)
	logAudit(aid, aname, "generate_reset_token", "user", user.ID, user.Username)

	return c.JSON(http.StatusOK, echo.Map{
		"link":       link,
		"expires_at": reset.ExpiresAt,
	})
}

// ResetPassword POST /api/v1/auth/reset-password — публичный эндпоинт
func ResetPassword(c echo.Context) error {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := c.Bind(&req); err != nil || req.Token == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "token and password required"})
	}
	if len(req.Password) < 6 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "password must be at least 6 characters"})
	}

	var reset models.PasswordReset
	if err := database.DB.Where("token = ? AND used = ? AND expires_at > ?", req.Token, false, time.Now()).
		First(&reset).Error; err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid or expired token"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to hash password"})
	}

	database.DB.Model(&models.User{}).Where("id = ?", reset.UserID).Update("password_hash", string(hash))
	database.DB.Model(&reset).Update("used", true)

	return c.JSON(http.StatusOK, echo.Map{"message": "password changed"})
}
