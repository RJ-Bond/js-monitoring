package telegram

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
)

// Bot — минималистичный клиент Telegram Bot API
type Bot struct {
	token string
}

func New(token string) *Bot {
	return &Bot{token: token}
}

func (b *Bot) enabled() bool {
	return b.token != ""
}

// SendMessage отправляет HTML-сообщение в указанный чат
func (b *Bot) SendMessage(chatID, message string) error {
	if !b.enabled() || chatID == "" {
		return nil
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", b.token)
	params := url.Values{
		"chat_id":    {chatID},
		"text":       {message},
		"parse_mode": {"HTML"},
	}

	resp, err := http.PostForm(apiURL, params)
	if err != nil {
		return fmt.Errorf("telegram API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram API returned %d", resp.StatusCode)
	}
	return nil
}

// AlertServerOffline отправляет уведомление о падении сервера
func (b *Bot) AlertServerOffline(chatID, serverName, ip string, port uint16) {
	msg := fmt.Sprintf(
		"🔴 <b>Сервер OFFLINE!</b>\n\n"+
			"Сервер: <code>%s</code>\n"+
			"Адрес: <code>%s:%d</code>\n\n"+
			"Проверьте панель мониторинга!",
		serverName, ip, port,
	)
	if err := b.SendMessage(chatID, msg); err != nil {
		log.Printf("[Telegram] alert failed: %v", err)
	}
}

// AlertServerOnline отправляет уведомление о восстановлении сервера
func (b *Bot) AlertServerOnline(chatID, serverName string) {
	msg := fmt.Sprintf(
		"✅ <b>Сервер снова ONLINE!</b>\n\n"+
			"Сервер <code>%s</code> восстановлен.",
		serverName,
	)
	if err := b.SendMessage(chatID, msg); err != nil {
		log.Printf("[Telegram] alert failed: %v", err)
	}
}
