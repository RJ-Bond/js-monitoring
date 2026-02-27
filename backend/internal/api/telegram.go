package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// sendTGMessage отправляет текстовое сообщение в Telegram-чат (parse_mode=HTML).
// threadID — ID темы (топика) в супергруппе; пустая строка = главный чат.
// Возвращает ID отправленного сообщения как строку.
func sendTGMessage(token, chatID, threadID, text string) (string, error) {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}
	if threadID != "" && threadID != "0" {
		if tid, err := strconv.Atoi(threadID); err == nil {
			payload["message_thread_id"] = tid
		}
	}
	b, _ := json.Marshal(payload)
	resp, err := sharedHTTPClient.Post(apiURL, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	var tgResp struct {
		OK     bool `json:"ok"`
		Result struct {
			MessageID int `json:"message_id"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tgResp); err != nil {
		return "", nil
	}
	return strconv.Itoa(tgResp.Result.MessageID), nil
}

// sendTGPhoto отправляет фото с подписью (parse_mode=HTML).
// Возвращает ID отправленного сообщения как строку.
func sendTGPhoto(token, chatID, threadID, photoURL, caption string) (string, error) {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", token)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"photo":      photoURL,
		"caption":    caption,
		"parse_mode": "HTML",
	}
	if threadID != "" && threadID != "0" {
		if tid, err := strconv.Atoi(threadID); err == nil {
			payload["message_thread_id"] = tid
		}
	}
	b, _ := json.Marshal(payload)
	resp, err := sharedHTTPClient.Post(apiURL, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	var tgResp struct {
		OK     bool `json:"ok"`
		Result struct {
			MessageID int `json:"message_id"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tgResp); err != nil {
		return "", nil
	}
	return strconv.Itoa(tgResp.Result.MessageID), nil
}

// editTGMessage редактирует текст существующего сообщения (parse_mode=HTML).
func editTGMessage(token, chatID, messageID, text string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/editMessageText", token)
	msgIDInt, _ := strconv.Atoi(messageID)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"message_id": msgIDInt,
		"text":       text,
		"parse_mode": "HTML",
	}
	b, _ := json.Marshal(payload)
	resp, err := sharedHTTPClient.Post(apiURL, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram editMessageText returned %d", resp.StatusCode)
	}
	return nil
}

// editTGCaption редактирует подпись (caption) существующего медиа-сообщения.
func editTGCaption(token, chatID, messageID, caption string) error {
	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/editMessageCaption", token)
	msgIDInt, _ := strconv.Atoi(messageID)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"message_id": msgIDInt,
		"caption":    caption,
		"parse_mode": "HTML",
	}
	b, _ := json.Marshal(payload)
	resp, err := sharedHTTPClient.Post(apiURL, "application/json", bytes.NewReader(b)) //nolint:noctx
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram editMessageCaption returned %d", resp.StatusCode)
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

// SendNewsToTelegram отправляет или обновляет новость в Telegram-канале/группе (асинхронно).
// Если item.TelegramMessageID заполнен — редактирует существующее сообщение.
// При ошибке редактирования (сообщение удалено) отправляет новое и сохраняет ID.
func SendNewsToTelegram(item *models.NewsItem, appURL, botToken, chatID, threadID string) {
	if botToken == "" || chatID == "" {
		return
	}
	itemID := item.ID
	existingMsgID := item.TelegramMessageID
	hasImage := item.ImageURL != ""
	imageURL := item.ImageURL

	go func() {
		text := buildTGNewsText(item, appURL)

		// Попытка редактировать существующее сообщение
		if existingMsgID != "" {
			var editErr error
			if hasImage {
				editErr = editTGCaption(botToken, chatID, existingMsgID, text)
			} else {
				editErr = editTGMessage(botToken, chatID, existingMsgID, text)
			}
			if editErr == nil {
				return // успешно отредактировано
			}
			// Сообщение удалено или недоступно — отправляем новое
		}

		// Отправка нового сообщения
		var msgID string
		if hasImage {
			caption := text
			if len([]rune(caption)) > 1000 {
				caption = string([]rune(caption)[:1000]) + "…"
			}
			var err error
			msgID, err = sendTGPhoto(botToken, chatID, threadID, imageURL, caption)
			if err != nil {
				msgID, _ = sendTGMessage(botToken, chatID, threadID, text)
			}
		} else {
			msgID, _ = sendTGMessage(botToken, chatID, threadID, text)
		}

		if msgID != "" && msgID != "0" {
			database.DB.Model(&models.NewsItem{}).Where("id = ?", itemID).
				Update("telegram_message_id", msgID)
		}
	}()
}

// TestTelegramNewsWebhook POST /api/v1/admin/news/telegram/test
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

	moscow := time.FixedZone("Europe/Moscow", 3*60*60)
	text := fmt.Sprintf(
		"<b>Тестовое уведомление</b>\n\nЭто тестовое сообщение от <b>%s</b> (%s МСК).",
		html.EscapeString(siteName),
		time.Now().In(moscow).Format("15:04:05"),
	)

	type result struct {
		err error
	}
	ch := make(chan result, 1)
	go func() {
		_, err := sendTGMessage(s.NewsTGBotToken, s.NewsTGChatID, s.NewsTGThreadID, text)
		ch <- result{err}
	}()

	select {
	case r := <-ch:
		if r.err != nil {
			return c.JSON(http.StatusBadGateway, echo.Map{"error": r.err.Error()})
		}
	case <-time.After(10 * time.Second):
		return c.JSON(http.StatusGatewayTimeout, echo.Map{"error": "timeout waiting for Telegram response"})
	}

	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

