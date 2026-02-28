package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// VRisingPlayer — онлайн-игрок в мире V Rising
type VRisingPlayer struct {
	Name   string  `json:"name"`
	Clan   string  `json:"clan,omitempty"`
	X      float32 `json:"x"`
	Z      float32 `json:"z"`
	Health float32 `json:"health,omitempty"`
}

// VRisingCastle — замок игрока/клана
type VRisingCastle struct {
	Owner string  `json:"owner"`
	Clan  string  `json:"clan,omitempty"`
	X     float32 `json:"x"`
	Z     float32 `json:"z"`
	Tier  int     `json:"tier,omitempty"` // 1–5
	Name  string  `json:"name,omitempty"`
}

// VRisingMapPayload — данные, присылаемые плагином
type VRisingMapPayload struct {
	ServerID int             `json:"server_id"`
	Players  []VRisingPlayer `json:"players"`
	Castles  []VRisingCastle `json:"castles"`
}

// VRisingMapResponse — ответ на запрос карты с метаинформацией
type VRisingMapResponse struct {
	ServerID  int             `json:"server_id"`
	Players   []VRisingPlayer `json:"players"`
	Castles   []VRisingCastle `json:"castles"`
	UpdatedAt time.Time       `json:"updated_at"`
	StaleData bool            `json:"stale_data"` // данные старше 5 минут
}

// PushVRisingMap POST /api/v1/vrising/push
// Принимает данные от BepInEx плагина.
// Аутентификация — JWTMiddleware (Bearer token или X-API-Key из профиля).
func PushVRisingMap(c echo.Context) error {
	userID := uint(c.Get("user_id").(float64))
	role, _ := c.Get("role").(string)

	var payload VRisingMapPayload
	if err := c.Bind(&payload); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid payload"})
	}

	if payload.ServerID <= 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "server_id is required"})
	}

	// Проверяем, что сервер существует и пользователь — владелец или администратор
	var server models.Server
	if err := database.DB.First(&server, payload.ServerID).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "server not found"})
	}
	if role != "admin" && server.OwnerID != userID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "not your server"})
	}

	dataJSON, _ := json.Marshal(payload)

	var existing models.VRisingMapData
	result := database.DB.Where("server_id = ?", payload.ServerID).First(&existing)
	if result.Error != nil {
		// Создаём новую запись
		newData := models.VRisingMapData{
			ServerID:  uint(payload.ServerID),
			Data:      string(dataJSON),
			UpdatedAt: time.Now(),
		}
		database.DB.Create(&newData)
	} else {
		// Обновляем существующую
		database.DB.Model(&existing).Updates(map[string]interface{}{
			"data":       string(dataJSON),
			"updated_at": time.Now(),
		})
	}

	return c.JSON(http.StatusOK, echo.Map{"ok": true})
}

// GetVRisingMap GET /api/v1/servers/:id/vrising/map
// Публичный эндпоинт, возвращает последние данные карты от плагина
func GetVRisingMap(c echo.Context) error {
	serverID := c.Param("id")

	var mapData models.VRisingMapData
	if err := database.DB.Where("server_id = ?", serverID).First(&mapData).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "no map data available"})
	}

	var payload VRisingMapPayload
	if err := json.Unmarshal([]byte(mapData.Data), &payload); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "data parse error"})
	}

	resp := VRisingMapResponse{
		ServerID:  payload.ServerID,
		Players:   payload.Players,
		Castles:   payload.Castles,
		UpdatedAt: mapData.UpdatedAt,
		StaleData: time.Since(mapData.UpdatedAt) > 5*time.Minute,
	}

	return c.JSON(http.StatusOK, resp)
}
