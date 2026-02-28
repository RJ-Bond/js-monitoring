package bot

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/bwmarrin/discordgo"
	"gorm.io/gorm"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

const botVersion = "v2.4.0"

// DiscordBot manages the Discord Gateway connection and slash command interactions.
type DiscordBot struct {
	session         *discordgo.Session
	db              *gorm.DB
	appURL          string
	activeMessages  sync.Map      // key: "channelID:serverID" → messageID
	activePeriods   sync.Map      // key: "channelID:serverID" → current period string
	refreshInterval time.Duration // embed auto-refresh interval, read from SiteSettings on startup
	cmdCooldowns    sync.Map      // key: userID → time.Time (anti-spam для /addserver)
}

// NewDiscordBot creates a new DiscordBot with the given bot token.
func NewDiscordBot(token, appURL string) (*DiscordBot, error) {
	dg, err := discordgo.New("Bot " + token)
	if err != nil {
		return nil, fmt.Errorf("discordgo: %w", err)
	}
	dg.Identify.Intents = discordgo.IntentsGuilds
	// Set explicit timeout so REST calls don't hang indefinitely through a slow proxy.
	dg.Client = &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy:               http.ProxyFromEnvironment,
			MaxIdleConnsPerHost: 10,
		},
	}
	b := &DiscordBot{session: dg, db: database.DB, appURL: appURL}
	dg.AddHandler(b.handleInteraction)
	return b, nil
}

// Start opens the Gateway, registers commands, and blocks until ctx is cancelled.
func (b *DiscordBot) Start(ctx context.Context) {
	if err := b.session.Open(); err != nil {
		log.Printf("[discord-bot] failed to open session: %v", err)
		return
	}
	defer b.session.Close()

	// Wait for Ready so we have the application ID.
	time.Sleep(2 * time.Second)

	// Read refresh interval from settings (default 60 s, minimum 10 s).
	var settings models.SiteSettings
	b.db.First(&settings)
	interval := time.Duration(settings.DiscordRefreshInterval) * time.Second
	if interval < 10*time.Second {
		interval = 60 * time.Second
	}
	b.refreshInterval = interval
	log.Printf("[discord-bot] embed refresh interval: %v", b.refreshInterval)

	b.registerCommands()
	b.restoreEmbeds()
	b.startPresenceUpdater(ctx)
	b.startAlertChecker(ctx)

	log.Println("[discord-bot] started")
	<-ctx.Done()
	log.Println("[discord-bot] shutting down")
}

// registerCommands registers the /addserver slash command globally
// and removes any stale commands that are no longer used.
func (b *DiscordBot) registerCommands() {
	appID := b.session.State.User.ID

	current := map[string]bool{
		"addserver": true,
		"stats":     true,
		"top":       true,
	}

	// Delete commands that are registered in Discord but no longer used.
	if existing, err := b.session.ApplicationCommands(appID, ""); err == nil {
		for _, c := range existing {
			if !current[c.Name] {
				if err := b.session.ApplicationCommandDelete(appID, "", c.ID); err != nil {
					log.Printf("[discord-bot] failed to delete stale command /%s: %v", c.Name, err)
				} else {
					log.Printf("[discord-bot] deleted stale command: /%s", c.Name)
				}
			}
		}
	}

	cmd := &discordgo.ApplicationCommand{
		Name:        "addserver",
		Description: "Показать статус игрового сервера",
		Options: []*discordgo.ApplicationCommandOption{
			{
				Type:         discordgo.ApplicationCommandOptionString,
				Name:         "id",
				Description:  "Выбери сервер из списка или введи его ID",
				Required:     false,
				Autocomplete: true,
			},
		},
	}
	if _, err := b.session.ApplicationCommandCreate(appID, "", cmd); err != nil {
		log.Printf("[discord-bot] command register error: %v", err)
	} else {
		log.Println("[discord-bot] /addserver command registered")
	}

	statsCmd := &discordgo.ApplicationCommand{
		Name:        "stats",
		Description: "Показать глобальную статистику мониторинга",
	}
	if _, err := b.session.ApplicationCommandCreate(appID, "", statsCmd); err != nil {
		log.Printf("[discord-bot] command register error /stats: %v", err)
	} else {
		log.Println("[discord-bot] /stats command registered")
	}

	topCmd := &discordgo.ApplicationCommand{
		Name:        "top",
		Description: "Топ-10 игроков за сегодня по времени в игре",
	}
	if _, err := b.session.ApplicationCommandCreate(appID, "", topCmd); err != nil {
		log.Printf("[discord-bot] command register error /top: %v", err)
	} else {
		log.Println("[discord-bot] /top command registered")
	}
}

// startPresenceUpdater rotates the bot's activity status every 60 s through 3 slides:
//  0. "за N серверами | M игроков"
//  1. "топ: [player] — Xч Yмин"  (top player by session time today)
//  2. "аптайм серверов: X%"       (average uptime across all servers, last 24 h)
func (b *DiscordBot) startPresenceUpdater(ctx context.Context) {
	slide := 0
	update := func() {
		text := b.presenceSlide(slide % 3)
		slide++
		if err := b.session.UpdateStatusComplex(discordgo.UpdateStatusData{
			Status: "online",
			Activities: []*discordgo.Activity{
				{Name: text, Type: discordgo.ActivityTypeWatching},
			},
		}); err != nil {
			log.Printf("[discord-bot] presence update error: %v", err)
		}
	}

	update()
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				update()
			}
		}
	}()
}

// presenceSlide returns the status text for the given slide index (0-2).
func (b *DiscordBot) presenceSlide(n int) string {
	switch n {
	case 0:
		var onlineServers, totalPlayers int64
		b.db.Model(&models.ServerStatus{}).Where("online_status = true").Count(&onlineServers)
		b.db.Model(&models.ServerStatus{}).Select("COALESCE(SUM(players_now), 0)").Scan(&totalPlayers)
		return fmt.Sprintf("за %d серверами | %d игроков", onlineServers, totalPlayers)
	case 1:
		now := time.Now()
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		var row struct {
			PlayerName string
			TotalSecs  int
		}
		b.db.Model(&models.PlayerSession{}).
			Select("player_name, COALESCE(SUM(duration), 0) as total_secs").
			Where("started_at >= ?", today).
			Group("player_name").
			Order("total_secs DESC").
			Limit(1).
			Scan(&row)
		if row.PlayerName == "" {
			return "нет активных игроков сегодня"
		}
		return fmt.Sprintf("топ: %s — %s", row.PlayerName, formatSessionDuration(row.TotalSecs))
	default: // case 2
		now := time.Now()
		since24h := now.Add(-24 * time.Hour)
		var totalH, onlineH int64
		b.db.Model(&models.PlayerHistory{}).Where("timestamp > ?", since24h).Count(&totalH)
		b.db.Model(&models.PlayerHistory{}).Where("timestamp > ? AND is_online = true", since24h).Count(&onlineH)
		if totalH == 0 {
			return "аптайм серверов: —"
		}
		return fmt.Sprintf("аптайм серверов: %d%%", onlineH*100/totalH)
	}
}

// handleInteraction dispatches incoming Discord interactions.
func (b *DiscordBot) handleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.Type {
	case discordgo.InteractionApplicationCommand:
		switch i.ApplicationCommandData().Name {
		case "addserver":
			b.handleServerCommand(s, i)
		case "stats":
			b.handleStatsCommand(s, i)
		case "top":
			b.handleTopCommand(s, i)
		}
	case discordgo.InteractionApplicationCommandAutocomplete:
		if i.ApplicationCommandData().Name == "addserver" {
			b.handleAddServerAutocomplete(s, i)
		}
	case discordgo.InteractionMessageComponent:
		cid := i.MessageComponentData().CustomID
		if strings.HasPrefix(cid, "chart_") {
			b.handleChartButton(s, i, cid)
		} else if cid == "admin_panel" {
			b.handleAdminButton(s, i)
		}
	}
}

// handleServerCommand handles the /addserver slash command.
// Only Discord server administrators may use it.
// Responds ephemerally (hidden) so "X uses /addserver" never appears in the channel,
// then posts the embed as a plain channel message for compact spacing.
func (b *DiscordBot) handleServerCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	// Only administrators of the Discord server may add server embeds.
	if i.Member == nil || i.Member.Permissions&discordgo.PermissionAdministrator == 0 {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "❌ Команда `/addserver` доступна только для администраторов сервера.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	// Rate limit: 5 секунд между использованиями команды одним пользователем
	const cooldown = 5 * time.Second
	userID := i.Member.User.ID
	if last, ok := b.cmdCooldowns.Load(userID); ok {
		since := time.Since(last.(time.Time))
		if since < cooldown {
			remaining := int((cooldown-since)/time.Second) + 1
			_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
				Type: discordgo.InteractionResponseChannelMessageWithSource,
				Data: &discordgo.InteractionResponseData{
					Content: fmt.Sprintf("⏳ Подождите **%d сек.** перед следующим использованием команды.", remaining),
					Flags:   discordgo.MessageFlagsEphemeral,
				},
			})
			return
		}
	}
	b.cmdCooldowns.Store(userID, time.Now())

	// Ephemeral ACK — only the caller sees "thinking", channel stays clean.
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Flags: discordgo.MessageFlagsEphemeral,
		},
	})

	go func() {
		opts := i.ApplicationCommandData().Options
		if len(opts) == 0 || opts[0].StringValue() == "" {
			b.replyServerList(s, i)
			return
		}

		serverID, err := strconv.Atoi(opts[0].StringValue())
		if err != nil {
			content := "❌ Неверный ID сервера."
			b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
			return
		}

		var srv models.Server
		if b.db.Preload("Status").First(&srv, serverID).Error != nil {
			content := "❌ Сервер не найден."
			b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
			return
		}

		// Check if this server is already posted in this channel.
		key := fmt.Sprintf("%s:%d", i.ChannelID, serverID)
		if _, exists := b.activeMessages.Load(key); exists {
			name := srv.Title
			if name == "" {
				addr := srv.DisplayIP
				if addr == "" {
					addr = srv.IP
				}
				name = fmt.Sprintf("%s:%d", addr, srv.Port)
			}
			content := fmt.Sprintf("ℹ️ Сервер **%s** уже добавлен в этот канал.", name)
			b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
			return
		}

		period := "24h"
		embed := b.buildServerEmbed(&srv, period)
		comps := b.buildComponents(uint(serverID), period)

		// Post as a plain channel message — no attribution header.
		msg, err := s.ChannelMessageSendComplex(i.ChannelID, &discordgo.MessageSend{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: comps,
		})
		if err != nil {
			log.Printf("[discord-bot] channel send failed: %v", err)
			content := fmt.Sprintf("❌ Не удалось отправить сообщение в канал.\nПричина: `%v`\n\nПроверьте, что у бота есть права **Send Messages** и **Embed Links** в этом канале.", err)
			b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
			return
		}

		// Track the posted message and its current period.
		b.activeMessages.Store(key, msg.ID)
		b.activePeriods.Store(key, period)

		// Persist embed to DB so it can be restored after bot restart.
		var de models.DiscordEmbed
		b.db.Where("channel_id = ? AND server_id = ?", i.ChannelID, serverID).FirstOrInit(&de)
		de.ChannelID = i.ChannelID
		de.ServerID = uint(serverID)
		de.MessageID = msg.ID
		de.Period = period
		b.db.Save(&de)

		// Remove the ephemeral "thinking..." placeholder.
		_ = s.InteractionResponseDelete(i.Interaction)

		// Auto-refresh: edit the channel message every minute (no 15-min limit).
		b.startChannelAutoRefresh(s, i.ChannelID, msg.ID, serverID, period, key)
	}()
}

// handleChartButton handles period-switch button clicks: chart_{serverID}_{period}
func (b *DiscordBot) handleChartButton(s *discordgo.Session, i *discordgo.InteractionCreate, customID string) {
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredMessageUpdate,
	})

	go func() {
		parts := strings.SplitN(strings.TrimPrefix(customID, "chart_"), "_", 2)
		if len(parts) != 2 {
			return
		}
		serverID, err := strconv.Atoi(parts[0])
		if err != nil {
			return
		}
		period := parts[1]

		var srv models.Server
		if b.db.Preload("Status").First(&srv, serverID).Error != nil {
			return
		}

		embed := b.buildServerEmbed(&srv, period)
		comps := b.buildComponents(uint(serverID), period)

		// Update tracked period so auto-refresh uses the newly selected period.
		key := fmt.Sprintf("%s:%d", i.ChannelID, serverID)
		b.activePeriods.Store(key, period)

		// Edit the message directly by ID — works even after interaction token expiry.
		if _, err := s.ChannelMessageEditComplex(&discordgo.MessageEdit{
			Channel:    i.ChannelID,
			ID:         i.Message.ID,
			Embeds:     &[]*discordgo.MessageEmbed{embed},
			Components: &comps,
		}); err != nil {
			log.Printf("[discord-bot] chart button edit failed: %v", err)
		}
	}()
}

// handleAdminButton handles the "⚙️ Админка" button click.
// Only Discord server administrators can use it; others get an ephemeral denial.
func (b *DiscordBot) handleAdminButton(s *discordgo.Session, i *discordgo.InteractionCreate) {
	if i.Member == nil || i.Member.Permissions&discordgo.PermissionAdministrator == 0 {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "❌ Кнопка доступна только для администраторов сервера.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	adminURL := strings.TrimRight(b.appURL, "/") + "/admin?tab=settings"
	content := fmt.Sprintf("⚙️ **Панель управления:**\n%s", adminURL)
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: content,
			Flags:   discordgo.MessageFlagsEphemeral,
		},
	})
}

// serverDisplayName возвращает имя сервера для отображения:
// приоритет: имя из игры (status.server_name) → title → IP:Port
func serverDisplayName(srv *models.Server) string {
	if srv.Status != nil && srv.Status.ServerName != "" {
		return srv.Status.ServerName
	}
	if srv.Title != "" {
		return srv.Title
	}
	return fmt.Sprintf("%s:%d", srv.IP, srv.Port)
}

// handleAddServerAutocomplete возвращает список серверов при вводе /addserver id:
func (b *DiscordBot) handleAddServerAutocomplete(s *discordgo.Session, i *discordgo.InteractionCreate) {
	var servers []models.Server
	b.db.Preload("Status").Limit(25).Find(&servers)

	var choices []*discordgo.ApplicationCommandOptionChoice
	for _, srv := range servers {
		name := serverDisplayName(&srv)
		label := fmt.Sprintf("%s:%d | %s", srv.IP, srv.Port, name)
		if len(label) > 100 {
			label = label[:97] + "…"
		}
		choices = append(choices, &discordgo.ApplicationCommandOptionChoice{
			Name:  label,
			Value: fmt.Sprintf("%d", srv.ID),
		})
	}

	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionApplicationCommandAutocompleteResult,
		Data: &discordgo.InteractionResponseData{
			Choices: choices,
		},
	})
}

// replyServerList edits the deferred response with a styled embed listing all servers.
func (b *DiscordBot) replyServerList(s *discordgo.Session, i *discordgo.InteractionCreate) {
	var servers []models.Server
	b.db.Preload("Status").Limit(25).Find(&servers)

	empty := ""

	if len(servers) == 0 {
		content := "Нет настроенных серверов."
		b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
		return
	}

	var desc strings.Builder
	onlineTotal, playerTotal := 0, 0
	for _, srv := range servers {
		name := serverDisplayName(&srv)
		statusEmoji := "🔴"
		playersStr := ""
		if srv.Status != nil && srv.Status.OnlineStatus {
			statusEmoji = "🟢"
			onlineTotal++
			playersStr = fmt.Sprintf(" · 👥 **%d**/%d", srv.Status.PlayersNow, srv.Status.PlayersMax)
			playerTotal += srv.Status.PlayersNow
		}
		desc.WriteString(fmt.Sprintf("%s `#%d` **%s**%s\n", statusEmoji, srv.ID, name, playersStr))
		desc.WriteString(fmt.Sprintf("　　`%s:%d`\n", srv.IP, srv.Port))
	}

	embed := &discordgo.MessageEmbed{
		Title:       "🖥️ Серверы мониторинга",
		Description: desc.String(),
		Color:       0x5865F2,
		Fields: []*discordgo.MessageEmbedField{
			{
				Name:   "🟢 Онлайн",
				Value:  fmt.Sprintf("%d из %d", onlineTotal, len(servers)),
				Inline: true,
			},
			{
				Name:   "👥 Игроков",
				Value:  fmt.Sprintf("%d", playerTotal),
				Inline: true,
			},
		},
		Footer: &discordgo.MessageEmbedFooter{
			Text: "Выбери сервер через автодополнение или /addserver id:<номер>",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	b.retryEdit(s, i, &discordgo.WebhookEdit{
		Content: &empty,
		Embeds:  &[]*discordgo.MessageEmbed{embed},
	})
}

// startChannelAutoRefresh edits a plain channel message every minute until it fails
// (e.g. message was deleted). No 15-minute token expiry constraint.
// key is the activeMessages entry; it is removed when the refresh loop exits.
func (b *DiscordBot) startChannelAutoRefresh(s *discordgo.Session, channelID, messageID string, serverID int, initialPeriod, key string) {
	// Ensure a safe interval — guard against zero value if called before Start() sets it.
	interval := b.refreshInterval
	if interval < 10*time.Second {
		interval = 60 * time.Second
	}
	go func() {
		defer b.activeMessages.Delete(key)
		defer b.activePeriods.Delete(key)
		defer b.db.Where("channel_id = ? AND server_id = ?", channelID, serverID).Delete(&models.DiscordEmbed{})
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		failCount := 0
		for range ticker.C {
			// Use the most recently selected period (updated by handleChartButton).
			currentPeriod := initialPeriod
			if p, ok := b.activePeriods.Load(key); ok {
				currentPeriod = p.(string)
			}
			var srv models.Server
			if b.db.Preload("Status").First(&srv, serverID).Error != nil {
				return
			}
			embed := b.buildServerEmbed(&srv, currentPeriod)
			comps := b.buildComponents(uint(serverID), currentPeriod)
			if _, err := s.ChannelMessageEditComplex(&discordgo.MessageEdit{
				Channel:    channelID,
				ID:         messageID,
				Embeds:     &[]*discordgo.MessageEmbed{embed},
				Components: &comps,
			}); err != nil {
				failCount++
				log.Printf("[discord-bot] auto-refresh error (%d/3) for %s: %v", failCount, messageID, err)
				if failCount >= 3 {
					log.Printf("[discord-bot] auto-refresh stopped after 3 errors for %s", messageID)
					return
				}
			} else {
				failCount = 0
			}
		}
	}()
}

// retryEdit attempts InteractionResponseEdit up to 3 times with backoff.
// With a 30-second HTTP timeout, total worst-case time is ~99 seconds.
func (b *DiscordBot) retryEdit(s *discordgo.Session, i *discordgo.InteractionCreate, data *discordgo.WebhookEdit) {
	// Ensure AppID is populated (gateway may leave it empty in rare cases).
	if i.Interaction.AppID == "" && s.State != nil && s.State.User != nil {
		i.Interaction.AppID = s.State.User.ID
		log.Printf("[discord-bot] retryEdit: AppID was empty, set to %s", i.Interaction.AppID)
	}
	log.Printf("[discord-bot] retryEdit start: appID=%q interaction=%s", i.Interaction.AppID, i.ID)

	for attempt := 1; attempt <= 3; attempt++ {
		if _, err := s.InteractionResponseEdit(i.Interaction, data); err == nil {
			log.Printf("[discord-bot] retryEdit: success on attempt %d", attempt)
			return
		} else {
			log.Printf("[discord-bot] edit attempt %d/3 failed: %v", attempt, err)
			if attempt < 3 {
				time.Sleep(time.Duration(attempt) * 3 * time.Second)
			}
		}
	}

	// All retries failed — try FollowupMessageCreate as last resort.
	log.Printf("[discord-bot] all edit attempts exhausted for interaction %s, trying followup", i.ID)
	params := &discordgo.WebhookParams{}
	if data.Content != nil {
		params.Content = *data.Content
	}
	if data.Embeds != nil {
		params.Embeds = *data.Embeds
	}
	if data.Components != nil {
		params.Components = *data.Components
	}
	if _, err := s.FollowupMessageCreate(i.Interaction, true, params); err != nil {
		log.Printf("[discord-bot] followup also failed: %v", err)
	} else {
		log.Printf("[discord-bot] followup succeeded for interaction %s", i.ID)
	}
}

// logoURL returns the public URL for the site logo, used as Discord embed footer icon.
// Returns empty string if appURL is not configured.
func (b *DiscordBot) logoURL() string {
	if b.appURL == "" {
		return ""
	}
	return strings.TrimRight(b.appURL, "/") + "/api/v1/logo"
}

// countryFlag converts an ISO 3166-1 alpha-2 code (e.g. "RU") to a flag emoji (e.g. 🇷🇺).
func countryFlag(code string) string {
	if len(code) != 2 {
		return ""
	}
	r0 := rune(0x1F1E6 + int32(code[0]-'A'))
	r1 := rune(0x1F1E6 + int32(code[1]-'A'))
	return string(r0) + string(r1)
}

// gameDisplayName maps internal game type identifiers to human-readable names.
func gameDisplayName(gameType string) string {
	names := map[string]string{
		"source":            "Source",
		"samp":              "SA:MP",
		"minecraft":         "Minecraft",
		"minecraft_bedrock": "Minecraft Bedrock",
		"fivem":             "FiveM",
		"gmod":              "Garry's Mod",
		"valheim":           "Valheim",
		"dayz":              "DayZ",
		"squad":             "Squad",
		"vrising":           "V Rising",
		"terraria":          "Terraria",
		"icarus":            "Icarus",
	}
	if name, ok := names[gameType]; ok {
		return name
	}
	return gameType
}

// loadLabel returns an emoji+text indicator of server fill percentage.
func loadLabel(pct int) string {
	switch {
	case pct == 0:
		return "⬛ Пусто"
	case pct <= 30:
		return "🟢 Свободно"
	case pct <= 60:
		return "🟡 Средне"
	case pct <= 90:
		return "🔴 Много"
	default:
		return "⛔ Полон"
	}
}

// pluralRu returns the correct Russian plural form for n.
// form1 — 1, 21, 31… (минута, час)
// form2 — 2-4, 22-24… (минуты, часа)
// form5 — 5-20, 25-30… (минут, часов)
func pluralRu(n int, form1, form2, form5 string) string {
	mod100 := n % 100
	mod10 := n % 10
	if mod100 >= 11 && mod100 <= 20 {
		return form5
	}
	switch mod10 {
	case 1:
		return form1
	case 2, 3, 4:
		return form2
	default:
		return form5
	}
}

// formatSessionDuration formats elapsed seconds using full Russian words with correct plural forms.
// Examples: "< 1 минуты", "1 минута", "5 минут", "1 час", "2 часа", "1 час 20 минут".
func formatSessionDuration(secs int) string {
	if secs < 60 {
		return "< 1 минуты"
	}
	mins := secs / 60
	hours := mins / 60
	mins = mins % 60
	if hours > 0 {
		hourStr := fmt.Sprintf("%d %s", hours, pluralRu(hours, "час", "часа", "часов"))
		if mins == 0 {
			return hourStr
		}
		return fmt.Sprintf("%s %d %s", hourStr, mins, pluralRu(mins, "минута", "минуты", "минут"))
	}
	return fmt.Sprintf("%d %s", mins, pluralRu(mins, "минута", "минуты", "минут"))
}

// handleStatsCommand handles /stats — global monitoring statistics embed.
func (b *DiscordBot) handleStatsCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	})
	go func() {
		now := time.Now()
		since24h := now.Add(-24 * time.Hour)

		var totalServers, onlineServers int64
		b.db.Model(&models.Server{}).Count(&totalServers)
		b.db.Model(&models.ServerStatus{}).Where("online_status = true").Count(&onlineServers)

		var totalPlayers int64
		b.db.Model(&models.ServerStatus{}).Select("COALESCE(SUM(players_now), 0)").Scan(&totalPlayers)

		// Global peak players over last 24h (sum across all servers per timestamp tick).
		var peakRow struct{ Peak int }
		b.db.Raw(`
			SELECT COALESCE(MAX(sum_count), 0) AS peak
			FROM (
				SELECT SUM(count) AS sum_count
				FROM player_history
				WHERE timestamp > ? AND is_online = true
				GROUP BY timestamp
			) t`, since24h).Scan(&peakRow)

		// Average uptime across all servers.
		var totalH, onlineH int64
		b.db.Model(&models.PlayerHistory{}).Where("timestamp > ?", since24h).Count(&totalH)
		b.db.Model(&models.PlayerHistory{}).Where("timestamp > ? AND is_online = true", since24h).Count(&onlineH)
		uptimeStr := "—"
		if totalH > 0 {
			uptimeStr = fmt.Sprintf("%d%%", onlineH*100/totalH)
		}

		// Top server by current player count.
		var topSrv models.Server
		topName := "—"
		topPlayers := 0
		if b.db.Preload("Status").
			Joins("LEFT JOIN server_statuses ON server_statuses.server_id = servers.id").
			Where("server_statuses.online_status = true").
			Order("server_statuses.players_now DESC").
			First(&topSrv).Error == nil {
			topName = topSrv.Title
			if topName == "" && topSrv.Status != nil && topSrv.Status.ServerName != "" {
				topName = topSrv.Status.ServerName
			}
			if topName == "" {
				addr := topSrv.IP
				if topSrv.DisplayIP != "" {
					addr = topSrv.DisplayIP
				}
				topName = fmt.Sprintf("%s:%d", addr, topSrv.Port)
			}
			if topSrv.Status != nil {
				topPlayers = topSrv.Status.PlayersNow
			}
		}

		var settings models.SiteSettings
		b.db.First(&settings)
		siteName := settings.SiteName
		if siteName == "" {
			siteName = "JS Monitor"
		}

		embed := &discordgo.MessageEmbed{
			Title: "📊 Статистика мониторинга",
			Color: 0x5865F2,
			Author: &discordgo.MessageEmbedAuthor{
				Name: siteName,
				URL:  strings.TrimRight(b.appURL, "/") + "/",
			},
			Fields: []*discordgo.MessageEmbedField{
				{Name: "🖥️ Серверов всего", Value: fmt.Sprintf("%d", totalServers), Inline: true},
				{Name: "🟢 Онлайн", Value: fmt.Sprintf("%d", onlineServers), Inline: true},
				{Name: "👥 Игроков сейчас", Value: fmt.Sprintf("%d", totalPlayers), Inline: true},
				{Name: "📈 Пик 24ч", Value: fmt.Sprintf("%d", peakRow.Peak), Inline: true},
				{Name: "⏱️ Средний аптайм 24ч", Value: uptimeStr, Inline: true},
				{Name: "🏆 Топ сервер", Value: fmt.Sprintf("%s (%d игр.)", topName, topPlayers), Inline: false},
			},
			Footer: &discordgo.MessageEmbedFooter{
				Text:    fmt.Sprintf("JS Monitor %s", botVersion),
				IconURL: b.logoURL(),
			},
			Timestamp: now.Format(time.RFC3339),
		}

		embeds := []*discordgo.MessageEmbed{embed}
		_, _ = s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Embeds: &embeds})
	}()
}

// handleTopCommand handles /top — top 10 players by session time today.
func (b *DiscordBot) handleTopCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
	})
	go func() {
		now := time.Now()
		today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

		var rows []struct {
			PlayerName string
			TotalSecs  int
		}
		b.db.Model(&models.PlayerSession{}).
			Select("player_name, COALESCE(SUM(duration), 0) as total_secs").
			Where("started_at >= ?", today).
			Group("player_name").
			Order("total_secs DESC").
			Limit(10).
			Scan(&rows)

		var lines []string
		medals := []string{"🥇", "🥈", "🥉"}
		for idx, row := range rows {
			medal := "▫️"
			if idx < len(medals) {
				medal = medals[idx]
			}
			lines = append(lines, fmt.Sprintf("%s **%s** — %s", medal, row.PlayerName, formatSessionDuration(row.TotalSecs)))
		}

		var settings models.SiteSettings
		b.db.First(&settings)
		siteName := settings.SiteName
		if siteName == "" {
			siteName = "JS Monitor"
		}

		description := "Нет данных за сегодня."
		if len(lines) > 0 {
			description = strings.Join(lines, "\n")
		}

		embed := &discordgo.MessageEmbed{
			Title:       fmt.Sprintf("🏆 Топ игроков — %s", now.Format("02.01.2006")),
			Description: description,
			Color:       0xF0B132,
			Author: &discordgo.MessageEmbedAuthor{
				Name: siteName,
				URL:  strings.TrimRight(b.appURL, "/") + "/",
			},
			Footer: &discordgo.MessageEmbedFooter{
				Text:    fmt.Sprintf("JS Monitor %s", botVersion),
				IconURL: b.logoURL(),
			},
			Timestamp: now.Format(time.RFC3339),
		}

		embeds := []*discordgo.MessageEmbed{embed}
		_, _ = s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{Embeds: &embeds})
	}()
}

// startAlertChecker polls server statuses every 60 s and sends an embed to
// DiscordAlertChannelID when a server transitions online↔offline.
func (b *DiscordBot) startAlertChecker(ctx context.Context) {
	type serverState struct {
		online bool
		name   string
	}

	prevStatus := make(map[uint]serverState)

	// Initialise from current DB state so we don't spam alerts on startup.
	var statuses []models.ServerStatus
	b.db.Find(&statuses)
	for _, st := range statuses {
		var srv models.Server
		name := ""
		if b.db.First(&srv, st.ServerID).Error == nil {
			name = srv.Title
			if name == "" && st.ServerName != "" {
				name = st.ServerName
			}
		}
		prevStatus[st.ServerID] = serverState{online: st.OnlineStatus, name: name}
	}

	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var settings models.SiteSettings
				b.db.First(&settings)
				alertCh := settings.DiscordAlertChannelID
				if alertCh == "" {
					continue
				}

				var currentStatuses []models.ServerStatus
				b.db.Find(&currentStatuses)

				for _, st := range currentStatuses {
					prev, known := prevStatus[st.ServerID]
					if !known {
						prevStatus[st.ServerID] = serverState{online: st.OnlineStatus}
						continue
					}
					if prev.online == st.OnlineStatus {
						continue
					}
					// Status changed — send alert.
					name := prev.name
					if name == "" {
						var srv models.Server
						if b.db.First(&srv, st.ServerID).Error == nil {
							name = srv.Title
							if name == "" && st.ServerName != "" {
								name = st.ServerName
							}
							if name == "" {
								name = fmt.Sprintf("Сервер #%d", st.ServerID)
							}
						}
					}
					if st.ServerName != "" && name == "" {
						name = st.ServerName
					}

					now := time.Now()
					var color int
					var titleEmoji, statusWord string
					if st.OnlineStatus {
						color = 0x57F287
						titleEmoji = "🟢"
						statusWord = "вернулся онлайн"
					} else {
						color = 0xED4245
						titleEmoji = "🔴"
						statusWord = "ушёл оффлайн"
					}

					embed := &discordgo.MessageEmbed{
						Title:       fmt.Sprintf("%s %s", titleEmoji, name),
						Description: fmt.Sprintf("Сервер **%s** %s.", name, statusWord),
						Color:       color,
						Footer: &discordgo.MessageEmbedFooter{
							Text:    fmt.Sprintf("JS Monitor %s", botVersion),
							IconURL: b.logoURL(),
						},
						Timestamp: now.Format(time.RFC3339),
					}

					if _, err := b.session.ChannelMessageSendComplex(alertCh, &discordgo.MessageSend{
						Embeds: []*discordgo.MessageEmbed{embed},
					}); err != nil {
						log.Printf("[discord-bot] alert send failed for server %d: %v", st.ServerID, err)
					}

					prevStatus[st.ServerID] = serverState{online: st.OnlineStatus, name: name}
				}
			}
		}
	}()
}

// restoreEmbeds loads all persisted DiscordEmbed records from DB and restarts
// their auto-refresh goroutines so embeds stay live after a bot restart.
func (b *DiscordBot) restoreEmbeds() {
	var embeds []models.DiscordEmbed
	b.db.Find(&embeds)
	for _, e := range embeds {
		key := fmt.Sprintf("%s:%d", e.ChannelID, e.ServerID)
		b.activeMessages.Store(key, e.MessageID)
		b.activePeriods.Store(key, e.Period)
		b.startChannelAutoRefresh(b.session, e.ChannelID, e.MessageID, int(e.ServerID), e.Period, key)
		log.Printf("[discord-bot] restored embed: channel=%s server=%d msg=%s period=%s", e.ChannelID, e.ServerID, e.MessageID, e.Period)
	}
	if len(embeds) > 0 {
		log.Printf("[discord-bot] restored %d embed(s) from DB", len(embeds))
	}
}

// buildServerEmbed creates a Discord embed styled after DiscordGSM.
func (b *DiscordBot) buildServerEmbed(srv *models.Server, period string) *discordgo.MessageEmbed {
	online := srv.Status != nil && srv.Status.OnlineStatus
	statusText := "🔴 Не в сети"
	color := 0xED4245
	if online {
		statusText = "🟢 В сети"
		color = 0x57F287
	}
	// Override with per-server custom color if set (e.g. "#FF5500" or "FF5500")
	if srv.DiscordColor != "" {
		hexStr := strings.TrimPrefix(srv.DiscordColor, "#")
		if v, err := strconv.ParseInt(hexStr, 16, 64); err == nil && v >= 0 {
			color = int(v)
		}
	}

	displayIP := srv.IP
	if srv.DisplayIP != "" {
		displayIP = srv.DisplayIP
	}

	// Country: flag emoji + name (or code as fallback)
	countryVal := countryFlag(srv.CountryCode)
	if srv.CountryName != "" {
		countryVal += " " + srv.CountryName
	} else if srv.CountryCode != "" {
		countryVal += " " + srv.CountryCode
	}
	if countryVal == "" {
		countryVal = "—"
	}

	gameVal := gameDisplayName(srv.GameType)
	if gameVal == "" {
		gameVal = "—"
	}

	mapVal := "Неизвестна"
	pingVal := "—"
	playersVal := "—"
	if online && srv.Status != nil {
		if srv.Status.CurrentMap != "" {
			mapVal = srv.Status.CurrentMap
		}
		if srv.Status.PingMS > 0 {
			pingVal = fmt.Sprintf("%d мс", srv.Status.PingMS)
		}
		if srv.Status.PlayersMax > 0 {
			pct := srv.Status.PlayersNow * 100 / srv.Status.PlayersMax
			playersVal = fmt.Sprintf("%d/%d • %s", srv.Status.PlayersNow, srv.Status.PlayersMax, loadLabel(pct))
		} else {
			playersVal = fmt.Sprintf("%d", srv.Status.PlayersNow)
		}
	}

	// Stats over last 24 hours from PlayerHistory.
	now := time.Now()
	since24h := now.Add(-24 * time.Hour)

	var peak int
	b.db.Model(&models.PlayerHistory{}).
		Select("COALESCE(MAX(count), 0)").
		Where("server_id = ? AND timestamp > ? AND is_online = true", srv.ID, since24h).
		Scan(&peak)

	var totalH, onlineH int64
	b.db.Model(&models.PlayerHistory{}).
		Where("server_id = ? AND timestamp > ?", srv.ID, since24h).
		Count(&totalH)
	b.db.Model(&models.PlayerHistory{}).
		Where("server_id = ? AND timestamp > ? AND is_online = true", srv.ID, since24h).
		Count(&onlineH)

	var avgOnline float64
	b.db.Model(&models.PlayerHistory{}).
		Select("COALESCE(AVG(count), 0)").
		Where("server_id = ? AND timestamp > ? AND is_online = true", srv.ID, since24h).
		Scan(&avgOnline)

	// Unique players today (midnight to now) from PlayerSession.
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var uniqueToday int64
	b.db.Model(&models.PlayerSession{}).
		Select("COUNT(DISTINCT player_name)").
		Where("server_id = ? AND started_at >= ?", srv.ID, today).
		Scan(&uniqueToday)

	uptimeVal := "—"
	if totalH > 0 {
		uptimeVal = fmt.Sprintf("%d%%", onlineH*100/totalH)
	}
	peakVal := fmt.Sprintf("%d", peak)
	avgVal := fmt.Sprintf("%d", int(avgOnline))
	uniqueVal := fmt.Sprintf("%d", uniqueToday)

	// Load site settings (used for site name + embed field config).
	var settings models.SiteSettings
	b.db.First(&settings)
	siteName := settings.SiteName
	if siteName == "" {
		siteName = "JS Monitor"
	}

	// Parse embed field visibility config (all fields shown by default).
	embedCfg := models.DefaultEmbedFieldConfig()
	if settings.DiscordEmbedConfig != "" {
		var c models.EmbedFieldConfig
		if err := json.Unmarshal([]byte(settings.DiscordEmbedConfig), &c); err == nil {
			embedCfg = c
		}
	}

	// Build fields conditionally based on admin-configured visibility.
	var fields []*discordgo.MessageEmbedField
	if embedCfg.Status {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "📊 Статус", Value: statusText, Inline: true})
	}
	if embedCfg.Address {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "🌐 Адрес", Value: fmt.Sprintf("`%s:%d`", displayIP, srv.Port), Inline: true})
	}
	if embedCfg.Country {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "🌍 Страна", Value: countryVal, Inline: true})
	}
	if embedCfg.Game {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "🎮 Игра", Value: gameVal, Inline: true})
	}
	if embedCfg.Map {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "🗺️ Карта", Value: mapVal, Inline: true})
	}
	if embedCfg.Ping {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "⚡ Пинг", Value: pingVal, Inline: true})
	}
	if embedCfg.Players {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "👥 Игроков", Value: playersVal, Inline: false})
	}
	if embedCfg.Peak24h {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "📈 Пик 24ч", Value: peakVal, Inline: true})
	}
	if embedCfg.Uptime24h {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "⏱️ Аптайм 24ч", Value: uptimeVal, Inline: true})
	}
	if embedCfg.Average24h {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "📊 Среднее 24ч", Value: avgVal, Inline: true})
	}
	if embedCfg.UniqueToday {
		fields = append(fields, &discordgo.MessageEmbedField{Name: "👤 Игроков сегодня", Value: uniqueVal, Inline: false})
	}

	// Player list from active sessions (ended_at IS NULL)
	if embedCfg.PlayerList && online && srv.Status != nil && srv.Status.PlayersNow > 0 {
		var sessions []models.PlayerSession
		b.db.Where("server_id = ? AND ended_at IS NULL", srv.ID).
			Order("started_at ASC").
			Limit(20).
			Find(&sessions)
		if len(sessions) > 0 {
			lines := make([]string, len(sessions))
			for idx, sess := range sessions {
				elapsed := int(time.Since(sess.StartedAt).Seconds())
				lines[idx] = fmt.Sprintf("%s — %s", sess.PlayerName, formatSessionDuration(elapsed))
			}
			fields = append(fields, &discordgo.MessageEmbedField{
				Name:   "📋 Список игроков",
				Value:  strings.Join(lines, "\n"),
				Inline: false,
			})
		}
	}

	// Title priority: user-set Title → server-reported ServerName → IP:Port fallback.
	title := srv.Title
	if title == "" && srv.Status != nil && srv.Status.ServerName != "" {
		title = srv.Status.ServerName
	}
	if title == "" {
		title = fmt.Sprintf("%s:%d", displayIP, srv.Port)
	}

	embed := &discordgo.MessageEmbed{
		Author: &discordgo.MessageEmbedAuthor{
			Name: siteName,
			URL:  strings.TrimRight(b.appURL, "/") + "/",
		},
		Title: title,
		Color: color,
		Fields: fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text:    fmt.Sprintf("JS Monitor %s", botVersion),
			IconURL: b.logoURL(),
		},
		Timestamp: now.Format(time.RFC3339),
	}

	if b.appURL != "" {
		base := strings.TrimRight(b.appURL, "/")
		imageURL := fmt.Sprintf("%s/api/v1/chart/%d?period=%s&_t=%d", base, srv.ID, period, now.Unix())
		embed.Image = &discordgo.MessageEmbedImage{URL: imageURL}
	}

	return embed
}

// buildComponents builds the action rows of buttons for a server embed.
// The period selector is a single cycle button: 24h → 7d → 30d → 24h.
// Clicking it switches to the next period; the label shows the current period.
func (b *DiscordBot) buildComponents(serverID uint, activePeriod string) []discordgo.MessageComponent {
	// Cycle order: 24h → 7d → 30d → 24h
	nextPeriod := map[string]string{"24h": "7d", "7d": "30d", "30d": "24h"}
	periodLabel := map[string]string{"24h": "📊 24ч", "7d": "📊 7д", "30d": "📊 30д"}

	next := nextPeriod[activePeriod]
	if next == "" {
		next = "7d"
	}
	label := periodLabel[activePeriod]
	if label == "" {
		label = "📊 24ч"
	}

	// Single row: period cycle button + admin panel button side by side.
	// Note: Discord only allows http/https/discord schemes in button URLs,
	// so steam:// connect links are not possible here.
	row := discordgo.ActionsRow{
		Components: []discordgo.MessageComponent{
			discordgo.Button{
				Label:    label,
				Style:    discordgo.PrimaryButton,
				CustomID: fmt.Sprintf("chart_%d_%s", serverID, next),
			},
			discordgo.Button{
				Label:    "⚙️ Админка",
				Style:    discordgo.DangerButton,
				CustomID: "admin_panel",
			},
		},
	}

	return []discordgo.MessageComponent{row}
}
