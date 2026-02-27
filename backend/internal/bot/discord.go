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
		Timeout: 10 * time.Second,
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

	// Wait for Ready so we have the application ID
	time.Sleep(2 * time.Second)
	b.registerCommands()

	log.Println("[discord-bot] started")
	<-ctx.Done()
	log.Println("[discord-bot] shutting down")
}

// registerCommands registers the /server slash command globally.
func (b *DiscordBot) registerCommands() {
	cmd := &discordgo.ApplicationCommand{
		Name:        "server",
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
	appID := b.session.State.User.ID
	if _, err := b.session.ApplicationCommandCreate(appID, "", cmd); err != nil {
		log.Printf("[discord-bot] command register error: %v", err)
	} else {
		log.Println("[discord-bot] /server command registered")
	}
}

// handleInteraction dispatches incoming Discord interactions.
func (b *DiscordBot) handleInteraction(s *discordgo.Session, i *discordgo.InteractionCreate) {
	switch i.Type {
	case discordgo.InteractionApplicationCommand:
		if i.ApplicationCommandData().Name == "server" {
			b.handleServerCommand(s, i)
		}
	case discordgo.InteractionMessageComponent:
		cid := i.MessageComponentData().CustomID
		if strings.HasPrefix(cid, "chart_") {
			b.handleChartButton(s, i, cid)
		}
	}
}

// handleServerCommand handles the /server slash command.
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

		embed := b.buildServerEmbed(&srv, "24h")
		comps := b.buildComponents(uint(serverID), "24h", srv.IP, srv.Port)
		b.retryEdit(s, i, &discordgo.WebhookEdit{
			Embeds:     &[]*discordgo.MessageEmbed{embed},
			Components: &comps,
		})
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
		comps := b.buildComponents(uint(serverID), period, srv.IP, srv.Port)
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
			lines = append(lines, fmt.Sprintf("`%d` — **%s** (%s:%d)", srv.ID, srv.Title, srv.IP, srv.Port))
		}
		content = "**Серверы:**\n" + strings.Join(lines, "\n") + "\n\nИспользуй `/server id:<номер>`"
	}
	b.retryEdit(s, i, &discordgo.WebhookEdit{Content: &content})
}

// retryEdit attempts InteractionResponseEdit up to 3 times with backoff.
// With a 10-second HTTP timeout, total worst-case time is ~35 seconds.
func (b *DiscordBot) retryEdit(s *discordgo.Session, i *discordgo.InteractionCreate, data *discordgo.WebhookEdit) {
	for attempt := 1; attempt <= 3; attempt++ {
		if _, err := s.InteractionResponseEdit(i.Interaction, data); err == nil {
			return
		} else if attempt < 3 {
			log.Printf("[discord-bot] edit attempt %d/3 failed: %v", attempt, err)
			time.Sleep(time.Duration(attempt) * 3 * time.Second)
		}
	}
	log.Printf("[discord-bot] all edit attempts exhausted for interaction %s", i.ID)
}

// buildServerEmbed creates a Discord embed for a server status card.
func (b *DiscordBot) buildServerEmbed(srv *models.Server, period string) *discordgo.MessageEmbed {
	online := srv.Status != nil && srv.Status.OnlineStatus
	statusEmoji := "🔴"
	color := 0xED4245 // red
	if online {
		statusEmoji = "🟢"
		color = 0x57F287 // green
	}

	title := fmt.Sprintf("%s %s", statusEmoji, srv.Title)

	desc := fmt.Sprintf("`%s:%d`", srv.IP, srv.Port)
	if srv.GameType != "" {
		desc += " | " + srv.GameType
	}

	var fields []*discordgo.MessageEmbedField
	if online && srv.Status != nil {
		fields = append(fields, &discordgo.MessageEmbedField{
			Name:   "👥 Игроки",
			Value:  fmt.Sprintf("%d / %d", srv.Status.PlayersNow, srv.Status.PlayersMax),
			Inline: true,
		})
		if srv.Status.PingMS > 0 {
			fields = append(fields, &discordgo.MessageEmbedField{
				Name:   "⚡ Пинг",
				Value:  fmt.Sprintf("%d мс", srv.Status.PingMS),
				Inline: true,
			})
		}
		if srv.Status.CurrentMap != "" {
			fields = append(fields, &discordgo.MessageEmbedField{
				Name:   "🗺️ Карта",
				Value:  srv.Status.CurrentMap,
				Inline: true,
			})
		}
	}

	embed := &discordgo.MessageEmbed{
		Title:       title,
		Description: desc,
		Color:       color,
		Fields:      fields,
		Footer: &discordgo.MessageEmbedFooter{
			Text: "JS Monitor",
		},
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	}

	if b.appURL != "" {
		chartURL := fmt.Sprintf("%s/api/v1/chart/%d?period=%s&_t=%d",
			strings.TrimRight(b.appURL, "/"), srv.ID, period, time.Now().Unix())
		embed.Image = &discordgo.MessageEmbedImage{URL: chartURL}
	}

	return embed
}

// buildComponents builds the row of period buttons + Connect button.
func (b *DiscordBot) buildComponents(serverID uint, activePeriod, ip string, port uint16) []discordgo.MessageComponent {
	periods := []struct {
		label  string
		period string
	}{
		{"24ч", "24h"},
		{"7д", "7d"},
		{"30д", "30d"},
	}

	var periodBtns []discordgo.MessageComponent
	for _, p := range periods {
		style := discordgo.SecondaryButton
		if p.period == activePeriod {
			style = discordgo.PrimaryButton
		}
		periodBtns = append(periodBtns, discordgo.Button{
			Label:    p.label,
			Style:    style,
			CustomID: fmt.Sprintf("chart_%d_%s", serverID, p.period),
		})
	}

	connectBtn := discordgo.Button{
		Label: "🔗 Connect",
		Style: discordgo.LinkButton,
		URL:   fmt.Sprintf("steam://connect/%s:%d", ip, port),
	}
	periodBtns = append(periodBtns, connectBtn)

	return []discordgo.MessageComponent{
		discordgo.ActionsRow{Components: periodBtns},
	}
}
