package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User — пользователь панели управления
type User struct {
	ID                uint       `gorm:"primaryKey;autoIncrement"              json:"id"`
	Username          string     `gorm:"type:varchar(50);uniqueIndex;not null" json:"username"`
	Email             *string    `gorm:"type:varchar(255);uniqueIndex"         json:"email,omitempty"`
	PasswordHash      string     `gorm:"type:varchar(255)"                     json:"-"`
	SteamID           *string    `gorm:"type:varchar(30);uniqueIndex"          json:"steam_id,omitempty"`
	Avatar            string     `gorm:"type:mediumtext"                       json:"avatar,omitempty"`
	APIToken          *string    `gorm:"type:varchar(64);uniqueIndex"          json:"api_token,omitempty"`
	Role              string     `gorm:"type:varchar(20);default:'user'"       json:"role"`
	Banned            bool       `gorm:"default:false"                         json:"banned"`
	TOTPSecret        string     `gorm:"type:varchar(100)"                     json:"-"`
	TOTPEnabled       bool       `gorm:"default:false"                         json:"totp_enabled"`
	SessionsClearedAt *time.Time `                                              json:"-"`
	DeleteScheduledAt *time.Time `gorm:"index"                                 json:"delete_scheduled_at,omitempty"`
	CreatedAt         time.Time  `                                              json:"created_at"`
	UpdatedAt         time.Time  `                                              json:"updated_at"`
}

// Server — основная запись игрового сервера
type Server struct {
	ID          uint      `gorm:"primaryKey;autoIncrement"              json:"id"`
	UUID        string    `gorm:"type:varchar(36);uniqueIndex;not null" json:"uuid"`
	Title       string    `gorm:"type:varchar(255);not null"            json:"title"`
	IP          string    `gorm:"type:varchar(45);not null"             json:"ip"`
	DisplayIP   string    `gorm:"type:varchar(255)"                     json:"display_ip"`
	Port        uint16    `gorm:"not null"                              json:"port"`
	GameType    string    `gorm:"type:varchar(30);not null"             json:"game_type"`
	SecretRCON  string    `gorm:"type:varchar(255)"                     json:"-"`
	CountryCode string    `gorm:"type:varchar(2)"                       json:"country_code"`
	CountryName string    `gorm:"type:varchar(100)"                     json:"country_name"`
	OwnerID     uint      `gorm:"index"                                 json:"owner_id"`
	CreatedAt   time.Time `                                             json:"created_at"`
	UpdatedAt   time.Time `                                             json:"updated_at"`

	Status      *ServerStatus `gorm:"foreignKey:ServerID" json:"status,omitempty"`
	AlertConfig *AlertsConfig `gorm:"foreignKey:ServerID" json:"alert_config,omitempty"`
}

// NewsItem — новость / объявление (создаётся администратором)
type NewsItem struct {
	ID        uint       `gorm:"primaryKey;autoIncrement"   json:"id"`
	Title     string     `gorm:"type:varchar(255);not null" json:"title"`
	Content   string     `gorm:"type:text;not null"         json:"content"`
	AuthorID  uint       `gorm:"index"                      json:"author_id"`
	ImageURL  string     `gorm:"type:varchar(500)"          json:"image_url"`
	Tags      string     `gorm:"type:varchar(500)"          json:"tags"` // через запятую: "Важно,Обновление"
	Pinned    bool       `gorm:"default:false;index"        json:"pinned"`
	Published bool       `gorm:"default:true;index"         json:"published"`
	PublishAt *time.Time `gorm:"index"                      json:"publish_at"`
	Views     int        `gorm:"default:0"                  json:"views"`
	CreatedAt time.Time  `                                  json:"created_at"`
	UpdatedAt time.Time  `                                  json:"updated_at"`
}

func (s *Server) BeforeCreate(_ *gorm.DB) error {
	s.UUID = uuid.New().String()
	return nil
}

// ServerStatus — текущее состояние сервера (upsert при каждом опросе)
type ServerStatus struct {
	ID           uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	ServerID     uint      `gorm:"uniqueIndex;not null"     json:"server_id"`
	OnlineStatus bool      `gorm:"default:false"            json:"online_status"`
	PlayersNow   int       `gorm:"default:0"                json:"players_now"`
	PlayersMax   int       `gorm:"default:0"                json:"players_max"`
	CurrentMap   string    `gorm:"type:varchar(255)"        json:"current_map"`
	ServerName   string    `gorm:"type:varchar(255)"        json:"server_name"`
	PingMS       int       `gorm:"default:0"                json:"ping_ms"`
	LastUpdate   time.Time `                                json:"last_update"`
}

// ServerPlayer — игрок на сервере (не хранится в БД, только для API ответа)
type ServerPlayer struct {
	Name string `json:"name"`
}

// PlayerHistory — история онлайна для графиков
type PlayerHistory struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	ServerID  uint      `gorm:"index;not null"           json:"server_id"`
	Count     int       `gorm:"not null"                 json:"count"`
	IsOnline  bool      `gorm:"default:true"             json:"is_online"`
	PingMS    int       `gorm:"default:0"                json:"ping_ms"`
	Timestamp time.Time `gorm:"index;not null"           json:"timestamp"`
}

// PlayerSession — сессия игрока на сервере (от входа до выхода)
type PlayerSession struct {
	ID         uint       `gorm:"primaryKey;autoIncrement"                     json:"id"`
	ServerID   uint       `gorm:"index:idx_sess_srv_start,priority:1;not null"  json:"server_id"`
	PlayerName string     `gorm:"type:varchar(64);index;not null"               json:"player_name"`
	StartedAt  time.Time  `gorm:"index:idx_sess_srv_start,priority:2;not null"  json:"started_at"`
	EndedAt    *time.Time `gorm:"index"                                         json:"ended_at"`
	Duration   int        `gorm:"default:0"                                     json:"duration"` // секунды
}

// SiteSettings — настройки сайта (одна строка, ID=1)
type SiteSettings struct {
	ID                  uint   `gorm:"primaryKey"                             json:"id"`
	SiteName            string `gorm:"type:varchar(100);not null;default:'JSMonitor'" json:"site_name"`
	LogoData            string `gorm:"type:mediumtext"                        json:"logo_data"`
	SteamAPIKey         string `gorm:"type:varchar(255)"                      json:"-"` // никогда не раскрывается через API
	AppURL              string `gorm:"type:varchar(255)"                      json:"app_url"`
	RegistrationEnabled bool   `gorm:"default:true"                           json:"registration_enabled"`
	NewsWebhookURL      string `gorm:"type:varchar(500)"                      json:"news_webhook_url"`
	NewsRoleID          string `gorm:"type:varchar(50)"                       json:"news_role_id"`
	NewsTGBotToken      string `gorm:"type:varchar(200)"                      json:"news_tg_bot_token"`
	NewsTGChatID        string `gorm:"type:varchar(100)"                      json:"news_tg_chat_id"`
	NewsTGThreadID      string `gorm:"type:varchar(50)"                       json:"news_tg_thread_id"`
	SSLMode             string `gorm:"type:varchar(20);default:'none'"        json:"ssl_mode"`   // none|letsencrypt|custom
	SSLDomain           string `gorm:"type:varchar(255)"                      json:"ssl_domain"`
	ForceHTTPS          bool   `gorm:"default:false"                          json:"force_https"`
}

// PasswordReset — токен для сброса пароля (генерируется администратором)
type PasswordReset struct {
	ID        uint      `gorm:"primaryKey;autoIncrement"`
	UserID    uint      `gorm:"index;not null"`
	Token     string    `gorm:"type:varchar(64);uniqueIndex;not null"`
	ExpiresAt time.Time `gorm:"not null"`
	Used      bool      `gorm:"default:false"`
	CreatedAt time.Time
}

// AuditLog — журнал действий администраторов и пользователей
type AuditLog struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	ActorID    uint      `gorm:"index"                   json:"actor_id"`
	ActorName  string    `gorm:"type:varchar(100)"       json:"actor_name"`
	Action     string    `gorm:"type:varchar(100);index" json:"action"`
	EntityType string    `gorm:"type:varchar(50)"        json:"entity_type"`
	EntityID   uint      `json:"entity_id"`
	Details    string    `gorm:"type:text"               json:"details"`
	CreatedAt  time.Time `gorm:"index"                   json:"created_at"`
}

// DiscordConfig — настройки Discord-виджета (webhook + persistent message)
type DiscordConfig struct {
	ID             uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	ServerID       uint   `gorm:"uniqueIndex;not null"     json:"server_id"`
	Enabled        bool   `gorm:"default:false"            json:"enabled"`
	WebhookURL     string `gorm:"type:varchar(500)"        json:"webhook_url"`
	MessageID      string `gorm:"type:varchar(50)"         json:"message_id"`  // ID Discord-сообщения для редактирования
	UpdateInterval int    `gorm:"default:5"                json:"update_interval"` // минуты, 1-60
}

// AlertsConfig — настройки уведомлений (Telegram + Email)
type AlertsConfig struct {
	ID             uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	ServerID       uint   `gorm:"uniqueIndex;not null"     json:"server_id"`
	ThresholdCPU   int    `gorm:"default:90"               json:"threshold_cpu"`
	OfflineTimeout int    `gorm:"default:5"                json:"offline_timeout"` // минуты
	TgChatID       string `gorm:"type:varchar(50)"         json:"tg_chat_id"`
	Enabled        bool   `gorm:"default:true"             json:"enabled"`
	NotifyOnline   bool   `gorm:"default:false"            json:"notify_online"`
	EmailTo        string `gorm:"type:varchar(200)"        json:"email_to"`
}

// UserSession — активная сессия пользователя (токен)
type UserSession struct {
	ID         uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     uint      `gorm:"index;not null"           json:"user_id"`
	JTI        string    `gorm:"type:varchar(36);uniqueIndex" json:"jti"`
	UserAgent  string    `gorm:"type:varchar(500)"        json:"user_agent"`
	IP         string    `gorm:"type:varchar(45)"         json:"ip"`
	CreatedAt  time.Time `                                json:"created_at"`
	LastUsedAt time.Time `                                json:"last_used_at"`
	ExpiresAt  time.Time `                                json:"expires_at"`
}
