package bot

import (
	"context"
	"fmt"
	"log"
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
func (b *DiscordBot) handleServerCommand(s *discordgo.Session, i *discordgo.InteractionCreate) {
	opts := i.ApplicationCommandData().Options
	if len(opts) == 0 || opts[0].StringValue() == "" {
		b.replyServerList(s, i)
		return
	}

	serverID, err := strconv.Atoi(opts[0].StringValue())
	if err != nil {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "❌ Неверный ID сервера.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	var srv models.Server
	if b.db.Preload("Status").First(&srv, serverID).Error != nil {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "❌ Сервер не найден.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	embed := b.buildServerEmbed(&srv, "24h")
	components := b.buildComponents(uint(serverID), "24h", srv.IP, srv.Port)

	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: components,
		},
	})
}

// handleChartButton handles period-switch button clicks: chart_{serverID}_{period}
func (b *DiscordBot) handleChartButton(s *discordgo.Session, i *discordgo.InteractionCreate, customID string) {
	// custom_id format: chart_{serverID}_{period}
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
	components := b.buildComponents(uint(serverID), period, srv.IP, srv.Port)

	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseUpdateMessage,
		Data: &discordgo.InteractionResponseData{
			Embeds:     []*discordgo.MessageEmbed{embed},
			Components: components,
		},
	})
}

// replyServerList replies with a list of configured servers.
func (b *DiscordBot) replyServerList(s *discordgo.Session, i *discordgo.InteractionCreate) {
	var servers []models.Server
	b.db.Limit(10).Find(&servers)

	if len(servers) == 0 {
		_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
			Type: discordgo.InteractionResponseChannelMessageWithSource,
			Data: &discordgo.InteractionResponseData{
				Content: "Нет настроенных серверов.",
				Flags:   discordgo.MessageFlagsEphemeral,
			},
		})
		return
	}

	var lines []string
	for _, srv := range servers {
		lines = append(lines, fmt.Sprintf("`%d` — **%s** (%s:%d)", srv.ID, srv.Title, srv.IP, srv.Port))
	}
	_ = s.InteractionRespond(i.Interaction, &discordgo.InteractionResponse{
		Type: discordgo.InteractionResponseChannelMessageWithSource,
		Data: &discordgo.InteractionResponseData{
			Content: "**Серверы:**\n" + strings.Join(lines, "\n") + "\n\nИспользуй `/server id:<номер>`",
			Flags:   discordgo.MessageFlagsEphemeral,
		},
	})
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
