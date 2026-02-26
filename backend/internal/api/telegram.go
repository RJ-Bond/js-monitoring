package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// sendTGMessage отправляет текстовое сообщение в Telegram-чат (parse_mode=HTML).
func sendTGMessage(token, chatID, text string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}
	b, _ := json.Marshal(payload)
	resp, err := http.Post(apiURL, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	return nil
}

// sendTGPhoto отправляет фото с подписью (parse_mode=HTML).
func sendTGPhoto(token, chatID, photoURL, caption string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"photo":      photoURL,
		"caption":    caption,
		"parse_mode": "HTML",
	}
	b, _ := json.Marshal(payload)
	resp, err := http.Post(apiURL, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	return nil
}

// buildTGNewsText формирует HTML-текст для отправки новости в Telegram.
func buildTGNewsText(item *models.NewsItem, appURL string) string {
	content := item.Content
	if len([]rune(content)) > 300 {
		content = string([]rune(content)[:300]) + "…"
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("<b>%s</b>\n\n", html.EscapeString(item.Title)))
	sb.WriteString(html.EscapeString(content))

	if appURL != "" {
		link := strings.TrimRight(appURL, "/") + fmt.Sprintf("/?news=%d", item.ID)
		sb.WriteString(fmt.Sprintf("\n\n<a href=\"%s\">Читать полностью →</a>", link))
	}

	if item.Tags != "" {
		tags := strings.Split(item.Tags, ",")
		var hashTags []string
		for _, t := range tags {
			if t = strings.TrimSpace(t); t != "" {
				hashTags = append(hashTags, "#"+strings.ReplaceAll(t, " ", "_"))
			}
		}
		if len(hashTags) > 0 {
			sb.WriteString("\n\n" + strings.Join(hashTags, " "))
		}
	}

	return sb.String()
}

// SendNewsToTelegram отправляет новость в Telegram-канал через Bot API (асинхронно).
// Если у новости есть image_url — отправляет sendPhoto, иначе sendMessage.
func SendNewsToTelegram(item *models.NewsItem, appURL, botToken, chatID string) {
	if botToken == "" || chatID == "" {
		return
	}
	text := buildTGNewsText(item, appURL)

	go func() {
		if item.ImageURL != "" {
			// Лимит подписи Telegram — 1024 символа
			caption := text
			if len([]rune(caption)) > 1000 {
				caption = string([]rune(caption)[:1000]) + "…"
			}
			if err := sendTGPhoto(botToken, chatID, item.ImageURL, caption); err != nil {
				// Fallback: отправить без фото
				_ = sendTGMessage(botToken, chatID, text)
			}
		} else {
			_ = sendTGMessage(botToken, chatID, text)
		}
	}()
}

// TestTelegramNewsWebhook POST /api/v1/admin/news/telegram/test
// Отправляет тестовое сообщение в настроенный Telegram-канал.
func TestTelegramNewsWebhook(c echo.Context) error {
	var s models.SiteSettings
	database.DB.First(&s, 1)

	if s.NewsTGBotToken == "" || s.NewsTGChatID == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "Telegram bot token or chat ID not configured"})
	}

	siteName := s.SiteName
	if siteName == "" {
		siteName = "JSMonitor"
	}

	text := fmt.Sprintf(
		"<b>Test Notification</b>\n\nThis is a test message from <b>%s</b> (%s).",
		html.EscapeString(siteName),
		time.Now().Format("15:04:05"),
	)

	ch := make(chan error, 1)
	go func() { ch <- sendTGMessage(s.NewsTGBotToken, s.NewsTGChatID, text) }()

	select {
	case err := <-ch:
		if err != nil {
			return c.JSON(http.StatusBadGateway, echo.Map{"error": err.Error()})
		}
	case <-time.After(10 * time.Second):
		return c.JSON(http.StatusGatewayTimeout, echo.Map{"error": "timeout waiting for Telegram response"})
	}

	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}
