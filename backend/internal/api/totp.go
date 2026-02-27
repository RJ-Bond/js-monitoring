package api

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/png"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/pquerna/otp/totp"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GenerateTOTP GET /api/v1/profile/totp — генерирует секрет и возвращает URL для QR-кода
func GenerateTOTP(c echo.Context) error {
	uid := uint(c.Get("user_id").(float64))
	username, _ := c.Get("username").(string)

	// Получаем site name из настроек
	siteName := "JSMonitor"
	var settings models.SiteSettings
	if database.DB.First(&settings, 1).Error == nil && settings.SiteName != "" {
		siteName = settings.SiteName
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      siteName,
		AccountName: username,
	})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to generate TOTP"})
	}

	// Сохраняем секрет временно (до подтверждения — EnableTOTP его закрепит)
	database.DB.Model(&models.User{}).Where("id = ?", uid).Update("totp_secret", key.Secret())

	// QR-код генерируется локально через pquerna/otp, возвращается как data URL
	img, err := key.Image(256, 256)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to generate QR image"})
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to encode QR image"})
	}
	qrDataURL := fmt.Sprintf("data:image/png;base64,%s", base64.StdEncoding.EncodeToString(buf.Bytes()))

	return c.JSON(http.StatusOK, echo.Map{
		"secret":  key.Secret(),
		"qr_url":  qrDataURL,
		"otp_url": key.URL(),
	})
}

// EnableTOTP POST /api/v1/profile/totp/enable — подтверждает код и активирует 2FA
func EnableTOTP(c echo.Context) error {
	uid := uint(c.Get("user_id").(float64))

	var req struct {
		Code string `json:"code"`
	}
	if err := c.Bind(&req); err != nil || req.Code == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "code required"})
	}

	var user models.User
	if err := database.DB.First(&user, uid).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if user.TOTPSecret == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "generate TOTP first"})
	}

	if !totp.Validate(req.Code, user.TOTPSecret) {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid code"})
	}

	database.DB.Model(&user).Update("totp_enabled", true)
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// DisableTOTP DELETE /api/v1/profile/totp — отключает 2FA (требует подтверждения кодом)
func DisableTOTP(c echo.Context) error {
	uid := uint(c.Get("user_id").(float64))

	var req struct {
		Code string `json:"code"`
	}
	if err := c.Bind(&req); err != nil || req.Code == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "code required"})
	}

	var user models.User
	if err := database.DB.First(&user, uid).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if !user.TOTPEnabled {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "2FA is not enabled"})
	}
	if !totp.Validate(req.Code, user.TOTPSecret) {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid code"})
	}

	database.DB.Model(&user).Updates(map[string]interface{}{
		"totp_enabled": false,
		"totp_secret":  "",
	})
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// Verify2FA POST /api/v1/auth/2fa — принимает temp_token + code → возвращает полный JWT
func Verify2FA(c echo.Context) error {
	var req struct {
		TempToken string `json:"temp_token"`
		Code      string `json:"code"`
	}
	if err := c.Bind(&req); err != nil || req.TempToken == "" || req.Code == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "temp_token and code required"})
	}

	// Валидируем temp_token
	token, err := jwt.Parse(req.TempToken, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return jwtSecret(), nil
	})
	if err != nil || !token.Valid {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid or expired temp token"})
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["role"] != "pending_2fa" {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid temp token"})
	}

	uid := uint(claims["sub"].(float64))

	var user models.User
	if err := database.DB.First(&user, uid).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if user.Banned {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "account is banned"})
	}
	if !user.TOTPEnabled || !totp.Validate(req.Code, user.TOTPSecret) {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid 2FA code"})
	}

	// Выдаём полный JWT
	jti := uuid.New().String()
	expiry := time.Now().Add(7 * 24 * time.Hour)
	fullClaims := jwt.MapClaims{
		"sub":      user.ID,
		"username": user.Username,
		"role":     user.Role,
		"jti":      jti,
		"exp":      expiry.Unix(),
		"iat":      time.Now().Unix(),
	}
	tk := jwt.NewWithClaims(jwt.SigningMethodHS256, fullClaims)
	fullToken, err := tk.SignedString(jwtSecret())
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token generation failed"})
	}

	createSession(user.ID, jti, c.Request().UserAgent(), c.RealIP(), expiry)

	return c.JSON(http.StatusOK, echo.Map{"token": fullToken, "user": user})
}
