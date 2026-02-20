package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User — пользователь панели управления
type User struct {
	ID           uint      `gorm:"primaryKey;autoIncrement"              json:"id"`
	Username     string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"username"`
	Email        string    `gorm:"type:varchar(255);uniqueIndex"         json:"email,omitempty"`
	PasswordHash string    `gorm:"type:varchar(255)"                     json:"-"`
	SteamID      string    `gorm:"type:varchar(30);uniqueIndex"          json:"steam_id,omitempty"`
	Avatar       string    `gorm:"type:mediumtext"                       json:"avatar,omitempty"`
	APIToken     string    `gorm:"type:varchar(64);uniqueIndex"          json:"api_token,omitempty"`
	Role         string    `gorm:"type:varchar(20);default:'user'"       json:"role"`
	Banned       bool      `gorm:"default:false"                         json:"banned"`
	CreatedAt    time.Time `                                             json:"created_at"`
	UpdatedAt    time.Time `                                             json:"updated_at"`
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
	ID        uint      `gorm:"primaryKey;autoIncrement"   json:"id"`
	Title     string    `gorm:"type:varchar(255);not null" json:"title"`
	Content   string    `gorm:"type:text;not null"         json:"content"`
	AuthorID  uint      `gorm:"index"                      json:"author_id"`
	CreatedAt time.Time `                                  json:"created_at"`
	UpdatedAt time.Time `                                  json:"updated_at"`
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
	Timestamp time.Time `gorm:"index;not null"           json:"timestamp"`
}

// AlertsConfig — настройки Telegram-уведомлений
type AlertsConfig struct {
	ID             uint   `gorm:"primaryKey;autoIncrement" json:"id"`
	ServerID       uint   `gorm:"uniqueIndex;not null"     json:"server_id"`
	ThresholdCPU   int    `gorm:"default:90"               json:"threshold_cpu"`
	OfflineTimeout int    `gorm:"default:5"                json:"offline_timeout"` // минуты
	TgChatID       string `gorm:"type:varchar(50)"         json:"tg_chat_id"`
	Enabled        bool   `gorm:"default:true"             json:"enabled"`
}
