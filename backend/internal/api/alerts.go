package api

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// SendTelegram отправляет сообщение в Telegram-чат через Bot API.
// Экспортируется для использования из poller.
func SendTelegram(chatID, text string) error {
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	if token == "" {
		return fmt.Errorf("TELEGRAM_BOT_TOKEN not set")
	}
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	resp, err := http.PostForm(apiURL, url.Values{ //nolint:noctx
		"chat_id":    {chatID},
		"text":       {text},
		"parse_mode": {"HTML"},
	})
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	return nil
}

// GetAlertConfig GET /api/v1/admin/alerts/:serverID
func GetAlertConfig(c echo.Context) error {
	serverID := c.Param("serverID")
	var cfg models.AlertsConfig
	if err := database.DB.Where("server_id = ?", serverID).First(&cfg).Error; err != nil {
		// Вернуть дефолты если записи нет
		return c.JSON(http.StatusOK, models.AlertsConfig{
			Enabled:        false,
			OfflineTimeout: 5,
		})
	}
	return c.JSON(http.StatusOK, cfg)
}

// UpdateAlertConfig PUT /api/v1/admin/alerts/:serverID
func UpdateAlertConfig(c echo.Context) error {
	serverID := c.Param("serverID")

	var req struct {
		Enabled        bool   `json:"enabled"`
		TgChatID       string `json:"tg_chat_id"`
		OfflineTimeout int    `json:"offline_timeout"`
		NotifyOnline   bool   `json:"notify_online"`
		EmailTo        string `json:"email_to"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}
	if req.OfflineTimeout <= 0 {
		req.OfflineTimeout = 5
	}
	req.TgChatID = strings.TrimSpace(req.TgChatID)
	req.EmailTo = strings.TrimSpace(req.EmailTo)

	var cfg models.AlertsConfig
	database.DB.Where("server_id = ?", serverID).First(&cfg)
	cfg.Enabled = req.Enabled
	cfg.TgChatID = req.TgChatID
	cfg.OfflineTimeout = req.OfflineTimeout
	cfg.NotifyOnline = req.NotifyOnline
	cfg.EmailTo = req.EmailTo

	if cfg.ID == 0 {
		// Парсим serverID
		var sid uint
		fmt.Sscanf(serverID, "%d", &sid)
		cfg.ServerID = sid
		if err := database.DB.Create(&cfg).Error; err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
		}
	} else {
		database.DB.Save(&cfg)
	}

	return c.JSON(http.StatusOK, cfg)
}
