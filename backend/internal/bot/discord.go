package bot

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
	"gorm.io/gorm"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// DiscordBot manages the Discord Gateway connection and slash command interactions.
type DiscordBot struct {
	session *discordgo.Session
	db      *gorm.DB
	appURL  string
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
	b.registerCommands()

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
				Type:        discordgo.ApplicationCommandOptionString,
				Name:        "id",
				Description: "ID сервера (число). Если не указан — покажет список.",
				Required:    false,
			},
		},
	}
	if _, err := b.session.ApplicationCommandCreate(appID, "", cmd); err != nil {
		log.Printf("[discord-bot] command register error: %v", err)
	} else {
		log.Println("[discord-bot] /addserver command registered")
	}
}

// handleInteraction dispatches incoming Discord interactions.
func (b *DiscordBot) handleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.Type {
	case discordgo.InteractionApplicationCommand:
		if i.ApplicationCommandData().Name == "addserver" {
			b.handleServerCommand(s, i)
		}
	case discordgo.InteractionMessageComponent:
		cid := i.MessageComponentData().CustomID
		if strings.HasPrefix(cid, "chart_") {
			b.handleChartButton(s, i, cid)
		}
	}
}

// handleServerCommand handles the /addserver slash command.
// Defers immediately, then fills the response in a goroutine.
func (b *DiscordBot) handleServerCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseDeferredChannelMessageWithSource,
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

		period := "24h"
		embed := b.buildServerEmbed(&srv, period)
		comps := b.buildComponents(uint(serverID), period)
		b.retryEdit(s, i, &discordgo.WebhookEdit{
			Embeds:     &[]*discordgo.MessageEmbed{embed},
			Components: &comps,
		})

		// Auto-refresh every minute while the interaction token is valid (~14 min).
		b.startAutoRefresh(s, i, serverID, period)
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
		b.retryEdit(s, i, &discordgo.WebhookEdit{
			Embeds:     &[]*discordgo.MessageEmbed{embed},
			Components: &comps,
		})
	}()
}

// replyServerList edits the deferred response with a list of configured servers.
func (b *DiscordBot) replyServerList(s *discordgo.Session, i *discordgo.InteractionCreate) {
	var servers []models.Server
	b.db.Limit(10).Find(&servers)

	var content string
	if len(servers) == 0 {
		content = "Нет настроенных серверов."
	} else {
		var lines []string
		for _, srv := range servers {
			name := srv.Title
			if name == "" {
				name = fmt.Sprintf("%s:%d", srv.IP, srv.Port)
			}
			addr := srv.IP
			if srv.DisplayIP != "" {
				addr = srv.DisplayIP
			}
			lines = append(lines, fmt.Sprintf("`%d` — **%s** (`%s:%d`)", srv.ID, name, addr, srv.Port))
		}
		content = "**Серверы:**\n" + strings.Join(lines, "\n") + "\n\nИспользуй `/addserver id:<номер>`"
	}
	b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
}

// startAutoRefresh re-edits the interaction message every minute for up to 14 minutes.
func (b *DiscordBot) startAutoRefresh(s *discordgo.Session, i *discordgo.InteractionCreate, serverID int, period string) {
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		deadline := time.After(14 * time.Minute)
		for {
			select {
			case <-ticker.C:
				var srv models.Server
				if b.db.Preload("Status").First(&srv, serverID).Error != nil {
					return
				}
				embed := b.buildServerEmbed(&srv, period)
				comps := b.buildComponents(uint(serverID), period)
				if _, err := s.InteractionResponseEdit(i.Interaction, &discordgo.WebhookEdit{
					Embeds:     &[]*discordgo.MessageEmbed{embed},
					Components: &comps,
				}); err != nil {
					log.Printf("[discord-bot] auto-refresh stopped: %v", err)
					return
				}
			case <-deadline:
				return
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

// countryFlag converts an ISO 3166-1 alpha-2 code (e.g. "RU") to a flag emoji (e.g. 🇷🇺).
func countryFlag(code string) string {
	if len(code) != 2 {
		return ""
	}
	r0 := rune(0x1F1E6 + int32(code[0]-'A'))
	r1 := rune(0x1F1E6 + int32(code[1]-'A'))
	return string(r0) + string(r1)
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

	gameVal := srv.GameType
	if gameVal == "" {
		gameVal = "—"
	}

	mapVal := "—"
	playersVal := "—"
	if online && srv.Status != nil {
		if srv.Status.CurrentMap != "" {
			mapVal = srv.Status.CurrentMap
		}
		if srv.Status.PlayersMax > 0 {
			pct := srv.Status.PlayersNow * 100 / srv.Status.PlayersMax
			playersVal = fmt.Sprintf("%d/%d (%d%%)", srv.Status.PlayersNow, srv.Status.PlayersMax, pct)
		} else {
			playersVal = fmt.Sprintf("%d", srv.Status.PlayersNow)
		}
	}

	// 3×2 grid of inline fields (matches DiscordGSM layout)
	fields := []*discordgo.MessageEmbedField{
		{Name: "Статус",              Value: statusText,                                Inline: true},
		{Name: "Адрес:Порт (запрос)", Value: fmt.Sprintf("`%s:%d`", displayIP, srv.Port), Inline: true},
		{Name: "Страна",              Value: countryVal,                                Inline: true},
		{Name: "Игра",                Value: gameVal,                                   Inline: true},
		{Name: "Текущая карта",       Value: mapVal,                                    Inline: true},
		{Name: "Игроков",             Value: playersVal,                                Inline: true},
	}

	// Player list from active sessions (ended_at IS NULL)
	if online && srv.Status != nil && srv.Status.PlayersNow > 0 {
		var sessions []models.PlayerSession
		b.db.Where("server_id = ? AND ended_at IS NULL", srv.ID).
			Order("started_at ASC").
			Limit(20).
			Find(&sessions)
		if len(sessions) > 0 {
			names := make([]string, len(sessions))
			for idx, s := range sessions {
				names[idx] = s.PlayerName
			}
			fields = append(fields, &discordgo.MessageEmbedField{
				Name:   "Список игроков",
				Value:  strings.Join(names, "   "),
				Inline: false,
			})
		}
	}

	now := time.Now().UTC()
	embed := &discordgo.MessageEmbed{
		Title:  srv.Title,
		Color:  color,
		Fields: fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: fmt.Sprintf("JS Monitor | Последнее обновление: %s", now.Format("2006-01-02 15:04:05")),
		},
	}

	if b.appURL != "" {
		chartURL := fmt.Sprintf("%s/api/v1/chart/%d?period=%s&_t=%d",
			strings.TrimRight(b.appURL, "/"), srv.ID, period, now.Unix())
		embed.Image = &discordgo.MessageEmbedImage{URL: chartURL}
	}

	return embed
}

// buildComponents builds the row of period-switch buttons.
func (b *DiscordBot) buildComponents(serverID uint, activePeriod string) []discordgo.MessageComponent {
	periods := []struct {
		label  string
		period string
	}{
		{"24ч", "24h"},
		{"7д", "7d"},
		{"30д", "30d"},
	}

	var btns []discordgo.MessageComponent
	for _, p := range periods {
		style := discordgo.SecondaryButton
		if p.period == activePeriod {
			style = discordgo.PrimaryButton
		}
		btns = append(btns, discordgo.Button{
			Label:    p.label,
			Style:    style,
			CustomID: fmt.Sprintf("chart_%d_%s", serverID, p.period),
		})
	}

	return []discordgo.MessageComponent{
		discordgo.ActionsRow{Components: btns},
	}
}
