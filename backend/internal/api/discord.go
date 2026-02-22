package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

type discordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type discordThumbnail struct {
	URL string `json:"url"`
}

type discordEmbed struct {
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Color       int               `json:"color"`
	Fields      []discordField    `json:"fields,omitempty"`
	Thumbnail   *discordThumbnail `json:"thumbnail,omitempty"`
	Footer      struct {
		Text string `json:"text"`
	} `json:"footer"`
	Timestamp string `json:"timestamp"`
}

type discordWebhookPayload struct {
	Username string         `json:"username,omitempty"`
	Content  string         `json:"content,omitempty"` // для @mention роли
	Embeds   []discordEmbed `json:"embeds"`
}

// gameThumbnailURL возвращает URL иконки игры из Steam CDN.
var gameThumbnailURL = map[string]string{
	"gmod":     "https://cdn.cloudflare.steamstatic.com/steam/apps/4000/capsule_sm_120.jpg",
	"valheim":  "https://cdn.cloudflare.steamstatic.com/steam/apps/892970/capsule_sm_120.jpg",
	"squad":    "https://cdn.cloudflare.steamstatic.com/steam/apps/393380/capsule_sm_120.jpg",
	"dayz":     "https://cdn.cloudflare.steamstatic.com/steam/apps/221100/capsule_sm_120.jpg",
	"vrising":  "https://cdn.cloudflare.steamstatic.com/steam/apps/1604030/capsule_sm_120.jpg",
	"icarus":   "https://cdn.cloudflare.steamstatic.com/steam/apps/1149460/capsule_sm_120.jpg",
	"fivem":    "https://cdn.cloudflare.steamstatic.com/steam/apps/271590/capsule_sm_120.jpg",
	"samp":     "https://cdn.cloudflare.steamstatic.com/steam/apps/12120/capsule_sm_120.jpg",
	"terraria": "https://cdn.cloudflare.steamstatic.com/steam/apps/105600/capsule_sm_120.jpg",
	"rust":     "https://cdn.cloudflare.steamstatic.com/steam/apps/252490/capsule_sm_120.jpg",
	"arma3":    "https://cdn.cloudflare.steamstatic.com/steam/apps/107410/capsule_sm_120.jpg",
}

// BuildDiscordPayload строит JSON-тело embed-сообщения для Discord webhook (статус сервера).
func BuildDiscordPayload(siteName, appURL string, srv *models.Server, status *models.ServerStatus) []byte {
	color := 10038562 // красный (офлайн)
	statusVal := "🔴 Офлайн"
	if status != nil && status.OnlineStatus {
		color = 3066993 // зелёный (онлайн)
		statusVal = "🟢 Онлайн"
	}

	title := srv.Title
	if title == "" && status != nil && status.ServerName != "" {
		title = status.ServerName
	}
	if title == "" {
		title = fmt.Sprintf("%s:%d", srv.IP, srv.Port)
	}

	addr := fmt.Sprintf("%s:%d", srv.IP, srv.Port)
	if srv.DisplayIP != "" {
		addr = fmt.Sprintf("%s:%d", srv.DisplayIP, srv.Port)
	}

	desc := fmt.Sprintf("`%s`", addr)
	if appURL != "" {
		desc += fmt.Sprintf("\n[🌐 Открыть на сайте](%s)", strings.TrimRight(appURL, "/"))
	}

	fields := []discordField{{Name: "Статус", Value: statusVal, Inline: true}}
	if status != nil && status.OnlineStatus {
		fields = append(fields, discordField{
			Name: "Игроки", Value: fmt.Sprintf("%d/%d", status.PlayersNow, status.PlayersMax), Inline: true,
		})
		if status.PingMS > 0 {
			fields = append(fields, discordField{
				Name: "Пинг", Value: fmt.Sprintf("%d ms", status.PingMS), Inline: true,
			})
		}
		if status.CurrentMap != "" {
			fields = append(fields, discordField{
				Name: "Карта", Value: status.CurrentMap, Inline: true,
			})
		}
	}

	embed := discordEmbed{
		Title:       title,
		Description: desc,
		Color:       color,
		Fields:      fields,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
	}
	embed.Footer.Text = siteName
	if thumbURL, ok := gameThumbnailURL[srv.GameType]; ok {
		embed.Thumbnail = &discordThumbnail{URL: thumbURL}
	}

	pl := discordWebhookPayload{Username: siteName, Embeds: []discordEmbed{embed}}
	b, _ := json.Marshal(pl)
	return b
}

// SendOrUpdateDiscordMessage отправляет новое или редактирует существующее сообщение через webhook.
// Возвращает message_id, который нужно сохранить для следующих обновлений.
func SendOrUpdateDiscordMessage(webhookURL, messageID string, payload []byte) (string, error) {
	if messageID != "" {
		patchURL := strings.TrimRight(webhookURL, "/") + "/messages/" + messageID
		req, err := http.NewRequest(http.MethodPatch, patchURL, bytes.NewReader(payload))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req) //nolint:noctx
			if err == nil {
				_ = resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					return messageID, nil
				}
				// 404 или другая ошибка — создаём новое сообщение
			}
		}
	}

	postURL := strings.TrimRight(webhookURL, "/") + "?wait=true"
	resp, err := http.Post(postURL, "application/json", bytes.NewReader(payload)) //nolint:noctx
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("discord webhook вернул статус %d", resp.StatusCode)
	}
	var msgResp struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&msgResp); err != nil {
		return "", err
	}
	return msgResp.ID, nil
}

// SendNewsToDiscord отправляет новость в Discord webhook (асинхронно).
// roleID — Discord Role ID для @mention (пустая строка = без упоминания).
func SendNewsToDiscord(item *models.NewsItem, appURL, webhookURL, siteName, roleID string) {
	if webhookURL == "" {
		return
	}

	content := item.Content
	if len([]rune(content)) > 300 {
		runes := []rune(content)
		content = string(runes[:300]) + "…"
	}

	description := content
	if appURL != "" {
		link := strings.TrimRight(appURL, "/") + fmt.Sprintf("/?news=%d", item.ID)
		description += fmt.Sprintf("\n\n[Читать полностью →](%s)", link)
	}

	color := 3447003 // синий
	if item.Pinned {
		color = 16766720 // золотой
	}

	embed := discordEmbed{
		Title:       item.Title,
		Description: description,
		Color:       color,
		Timestamp:   item.CreatedAt.UTC().Format(time.RFC3339),
	}
	embed.Footer.Text = siteName

	// Thumbnail из ImageURL новости
	if item.ImageURL != "" {
		embed.Thumbnail = &discordThumbnail{URL: item.ImageURL}
	}

	// Теги как поля embed
	if item.Tags != "" {
		tags := strings.Split(item.Tags, ",")
		cleaned := make([]string, 0, len(tags))
		for _, t := range tags {
			if t = strings.TrimSpace(t); t != "" {
				cleaned = append(cleaned, t)
			}
		}
		if len(cleaned) > 0 {
			embed.Fields = []discordField{{
				Name:   "Теги",
				Value:  strings.Join(cleaned, " · "),
				Inline: false,
			}}
		}
	}

	pl := discordWebhookPayload{Username: siteName, Embeds: []discordEmbed{embed}}
	// @mention роли, если указан roleID
	if roleID != "" {
		pl.Content = fmt.Sprintf("<@&%s>", roleID)
	}

	b, _ := json.Marshal(pl)

	go func() {
		resp, err := http.Post(strings.TrimRight(webhookURL, "/"), "application/json", bytes.NewReader(b)) //nolint:noctx
		if err == nil {
			_ = resp.Body.Close()
		}
	}()
}

func discordSiteName() string {
	var s models.SiteSettings
	if err := database.DB.First(&s, 1).Error; err != nil || s.SiteName == "" {
		return "JS Monitor"
	}
	return s.SiteName
}

// GetDiscordConfig GET /api/v1/admin/discord/:serverID
func GetDiscordConfig(c echo.Context) error {
	serverID := c.Param("serverID")
	var cfg models.DiscordConfig
	if err := database.DB.Where("server_id = ?", serverID).First(&cfg).Error; err != nil {
		return c.JSON(http.StatusOK, models.DiscordConfig{Enabled: false, UpdateInterval: 5})
	}
	return c.JSON(http.StatusOK, cfg)
}

// UpdateDiscordConfig PUT /api/v1/admin/discord/:serverID
func UpdateDiscordConfig(c echo.Context) error {
	serverID := c.Param("serverID")

	var req struct {
		Enabled        bool   `json:"enabled"`
		WebhookURL     string `json:"webhook_url"`
		UpdateInterval int    `json:"update_interval"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}
	if req.UpdateInterval <= 0 {
		req.UpdateInterval = 5
	}
	req.WebhookURL = strings.TrimSpace(req.WebhookURL)

	var cfg models.DiscordConfig
	database.DB.Where("server_id = ?", serverID).First(&cfg)

	// Смена URL — сбрасываем message_id (новое сообщение в новом канале)
	if cfg.WebhookURL != req.WebhookURL {
		cfg.MessageID = ""
	}

	cfg.Enabled = req.Enabled
	cfg.WebhookURL = req.WebhookURL
	cfg.UpdateInterval = req.UpdateInterval

	if cfg.ID == 0 {
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

// SendDiscordTest POST /api/v1/admin/discord/:serverID/test
// Немедленно отправляет тестовый embed в настроенный webhook.
func SendDiscordTest(c echo.Context) error {
	serverID := c.Param("serverID")

	var cfg models.DiscordConfig
	if err := database.DB.Where("server_id = ?", serverID).First(&cfg).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "discord config not found"})
	}
	if cfg.WebhookURL == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "webhook URL not configured"})
	}

	var srv models.Server
	if err := database.DB.Preload("Status").First(&srv, serverID).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}

	var s models.SiteSettings
	database.DB.First(&s, 1)

	payload := BuildDiscordPayload(discordSiteName(), s.AppURL, &srv, srv.Status)
	msgID, err := SendOrUpdateDiscordMessage(cfg.WebhookURL, cfg.MessageID, payload)
	if err != nil {
		return c.JSON(http.StatusBadGateway, echo.Map{"error": err.Error()})
	}
	if msgID != cfg.MessageID {
		database.DB.Model(&cfg).Update("message_id", msgID)
		cfg.MessageID = msgID
	}

	return c.JSON(http.StatusOK, echo.Map{"ok": true, "message_id": msgID})
}

// TestNewsWebhook POST /api/v1/admin/news/webhook/test
// Отправляет тестовое сообщение в настроенный News Discord Webhook.
func TestNewsWebhook(c echo.Context) error {
	var s models.SiteSettings
	if err := database.DB.First(&s, 1).Error; err != nil || s.NewsWebhookURL == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "news webhook not configured"})
	}
	now := time.Now()
	testItem := &models.NewsItem{
		Title:     "📰 Тест — " + s.SiteName,
		Content:   "Это тестовое сообщение. Discord-вебхук для новостей работает корректно! ✅",
		Tags:      "Тест,Проверка",
		Published: true,
		CreatedAt: now,
	}
	SendNewsToDiscord(testItem, s.AppURL, s.NewsWebhookURL, discordSiteName(), s.NewsRoleID)
	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}
