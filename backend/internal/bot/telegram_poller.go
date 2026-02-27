package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

var tgHTTPClient = &http.Client{Timeout: 35 * time.Second}

// TelegramPoller polls getUpdates and handles callback_query for chart period buttons.
type TelegramPoller struct {
	token  string
	appURL string
	db     *gorm.DB
	offset int64
}

// NewTelegramPoller creates a new TelegramPoller.
func NewTelegramPoller(token, appURL string) *TelegramPoller {
	return &TelegramPoller{token: token, appURL: appURL, db: database.DB}
}

// Start runs the long-polling loop until ctx is cancelled.
func (p *TelegramPoller) Start(ctx context.Context) {
	log.Println("[tg-poller] started")
	for {
		select {
		case <-ctx.Done():
			log.Println("[tg-poller] shutting down")
			return
		default:
		}

		updates, err := p.getUpdates(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[tg-poller] getUpdates error: %v", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			continue
		}

		for _, u := range updates {
			if u.UpdateID >= p.offset {
				p.offset = u.UpdateID + 1
			}
			if u.CallbackQuery != nil {
				p.handleCallbackQuery(u.CallbackQuery)
			}
		}
	}
}

type tgUpdate struct {
	UpdateID      int64               `json:"update_id"`
	CallbackQuery *tgCallbackQuery    `json:"callback_query"`
}

type tgCallbackQuery struct {
	ID      string     `json:"id"`
	Data    string     `json:"data"`
	Message *tgMessage `json:"message"`
}

type tgMessage struct {
	MessageID int   `json:"message_id"`
	Chat      tgChat `json:"chat"`
}

type tgChat struct {
	ID int64 `json:"id"`
}

func (p *TelegramPoller) getUpdates(ctx context.Context) ([]tgUpdate, error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?timeout=30&offset=%d&allowed_updates=[\"callback_query\"]",
		p.token, p.offset)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := tgHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		OK     bool       `json:"ok"`
		Result []tgUpdate `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result.Result, nil
}

// handleCallbackQuery processes chart period button presses.
// Expected callback_data format: "chart:{serverID}:{period}"
func (p *TelegramPoller) handleCallbackQuery(cq *tgCallbackQuery) {
	if !strings.HasPrefix(cq.Data, "chart:") {
		return
	}
	parts := strings.SplitN(strings.TrimPrefix(cq.Data, "chart:"), ":", 2)
	if len(parts) != 2 {
		return
	}
	serverID, err := strconv.Atoi(parts[0])
	if err != nil {
		return
	}
	period := parts[1]

	var srv models.Server
	if p.db.Preload("Status").First(&srv, serverID).Error != nil {
		p.answerCallback(cq.ID, "Сервер не найден")
		return
	}

	if cq.Message == nil {
		return
	}
	chatID := cq.Message.Chat.ID
	msgID := cq.Message.MessageID

	caption := buildTGServerCaption(&srv, period)
	keyboard := buildTGKeyboard(uint(serverID), period, srv.IP, srv.Port)

	if p.appURL != "" {
		chartURL := fmt.Sprintf("%s/api/v1/chart/%d?period=%s&_t=%d",
			strings.TrimRight(p.appURL, "/"), serverID, period, time.Now().Unix())
		p.editMessageMedia(chatID, msgID, chartURL, caption, keyboard)
	} else {
		p.editMessageCaption(chatID, msgID, caption, keyboard)
	}

	p.answerCallback(cq.ID, "")
}

// SendServerCard sends a server status card as a photo with inline keyboard.
// Called from the alert/notification system.
func SendServerCard(token, appURL, chatID, threadID string, srv *models.Server) {
	period := "24h"
	caption := buildTGServerCaption(srv, period)
	keyboard := buildTGKeyboard(srv.ID, period, srv.IP, srv.Port)

	if appURL != "" {
		chartURL := fmt.Sprintf("%s/api/v1/chart/%d?period=%s&_t=%d",
			strings.TrimRight(appURL, "/"), srv.ID, period, time.Now().Unix())
		sendTGServerPhoto(token, chatID, threadID, chartURL, caption, keyboard)
	} else {
		sendTGServerText(token, chatID, threadID, caption, keyboard)
	}
}

// buildTGServerCaption builds the caption text for a server card.
func buildTGServerCaption(srv *models.Server, period string) string {
	online := srv.Status != nil && srv.Status.OnlineStatus
	status := "🔴 Оффлайн"
	if online {
		status = "🟢 Онлайн"
	}

	periodLabel := map[string]string{"24h": "24ч", "7d": "7д", "30d": "30д"}[period]
	if periodLabel == "" {
		periodLabel = "24ч"
	}

	lines := []string{
		fmt.Sprintf("<b>%s</b>", escapeHTML(srv.Title)),
		fmt.Sprintf("%s  |  <code>%s:%d</code>", status, srv.IP, srv.Port),
	}
	if srv.GameType != "" {
		lines = append(lines, fmt.Sprintf("🎮 %s", escapeHTML(srv.GameType)))
	}
	if online && srv.Status != nil {
		lines = append(lines, fmt.Sprintf("👥 %d/%d игроков", srv.Status.PlayersNow, srv.Status.PlayersMax))
		if srv.Status.PingMS > 0 {
			lines = append(lines, fmt.Sprintf("⚡ Пинг: %d мс", srv.Status.PingMS))
		}
		if srv.Status.CurrentMap != "" {
			lines = append(lines, fmt.Sprintf("🗺️ %s", escapeHTML(srv.Status.CurrentMap)))
		}
	}
	lines = append(lines, fmt.Sprintf("\n📊 График: %s", periodLabel))

	return strings.Join(lines, "\n")
}

// buildTGKeyboard creates the inline keyboard with period buttons + Connect.
func buildTGKeyboard(serverID uint, activePeriod, ip string, port uint16) map[string]interface{} {
	periods := []struct{ label, cb string }{
		{"📊 24ч", fmt.Sprintf("chart:%d:24h", serverID)},
		{"📊 7д", fmt.Sprintf("chart:%d:7d", serverID)},
		{"📊 30д", fmt.Sprintf("chart:%d:30d", serverID)},
	}

	var row1 []map[string]string
	for _, p := range periods {
		label := p.label
		if strings.HasSuffix(p.cb, ":"+activePeriod) {
			label = "✅ " + strings.TrimPrefix(p.label, "📊 ")
		}
		row1 = append(row1, map[string]string{
			"text":          label,
			"callback_data": p.cb,
		})
	}

	row2 := []map[string]string{
		{
			"text": "🔗 Подключиться",
			"url":  fmt.Sprintf("steam://connect/%s:%d", ip, port),
		},
	}

	return map[string]interface{}{
		"inline_keyboard": []interface{}{row1, row2},
	}
}

func sendTGServerPhoto(token, chatID, threadID, photoURL, caption string, keyboard map[string]interface{}) {
	payload := map[string]interface{}{
		"chat_id":                  chatID,
		"photo":                    photoURL,
		"caption":                  caption,
		"parse_mode":               "HTML",
		"reply_markup":             keyboard,
		"disable_notification":     false,
	}
	if threadID != "" {
		payload["message_thread_id"] = threadID
	}
	tgPost(token, "sendPhoto", payload)
}

func sendTGServerText(token, chatID, threadID, text string, keyboard map[string]interface{}) {
	payload := map[string]interface{}{
		"chat_id":      chatID,
		"text":         text,
		"parse_mode":   "HTML",
		"reply_markup": keyboard,
	}
	if threadID != "" {
		payload["message_thread_id"] = threadID
	}
	tgPost(token, "sendMessage", payload)
}

func (p *TelegramPoller) editMessageMedia(chatID int64, msgID int, photoURL, caption string, keyboard map[string]interface{}) {
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"message_id": msgID,
		"media": map[string]interface{}{
			"type":       "photo",
			"media":      photoURL,
			"caption":    caption,
			"parse_mode": "HTML",
		},
		"reply_markup": keyboard,
	}
	tgPost(p.token, "editMessageMedia", payload)
}

func (p *TelegramPoller) editMessageCaption(chatID int64, msgID int, caption string, keyboard map[string]interface{}) {
	payload := map[string]interface{}{
		"chat_id":      chatID,
		"message_id":   msgID,
		"caption":      caption,
		"parse_mode":   "HTML",
		"reply_markup": keyboard,
	}
	tgPost(p.token, "editMessageCaption", payload)
}

func (p *TelegramPoller) answerCallback(callbackID, text string) {
	payload := map[string]interface{}{
		"callback_query_id": callbackID,
	}
	if text != "" {
		payload["text"] = text
	}
	tgPost(p.token, "answerCallbackQuery", payload)
}

// tgPost sends a POST request to the Telegram Bot API.
func tgPost(token, method string, payload interface{}) {
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	url := fmt.Sprintf("https://api.telegram.org/bot%s/%s", token, method)
	resp, err := tgHTTPClient.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		log.Printf("[tg-poller] %s error: %v", method, err)
		return
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	return s
}
