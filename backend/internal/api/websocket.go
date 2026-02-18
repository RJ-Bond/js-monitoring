package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(_ *http.Request) bool {
		return true // В продакшене проверять Origin
	},
}

// Hub управляет всеми WebSocket соединениями
type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.RWMutex
}

var WSHub = &Hub{
	clients:    make(map[*websocket.Conn]bool),
	broadcast:  make(chan []byte, 512),
	register:   make(chan *websocket.Conn),
	unregister: make(chan *websocket.Conn),
}

// Run — основной цикл хаба
func (h *Hub) Run() {
	for {
		select {
		case conn := <-h.register:
			h.mu.Lock()
			h.clients[conn] = true
			h.mu.Unlock()
			log.Printf("[WS] client connected, total: %d", len(h.clients))

		case conn := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[conn]; ok {
				delete(h.clients, conn)
				conn.Close()
			}
			h.mu.Unlock()
			log.Printf("[WS] client disconnected, total: %d", len(h.clients))

		case msg := <-h.broadcast:
			h.mu.RLock()
			for conn := range h.clients {
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					h.mu.RUnlock()
					h.unregister <- conn
					h.mu.RLock()
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastUpdate отправляет обновление статуса всем WS-клиентам
func (h *Hub) BroadcastUpdate(serverID uint, status *models.ServerStatus) {
	payload := map[string]interface{}{
		"type":      "status_update",
		"server_id": serverID,
		"status":    status,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("[WS] marshal error: %v", err)
		return
	}
	select {
	case h.broadcast <- data:
	default:
		log.Println("[WS] broadcast channel full, dropping message")
	}
}

// HandleWebSocket GET /api/v1/ws
func HandleWebSocket(c echo.Context) error {
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	WSHub.register <- conn
	defer func() { WSHub.unregister <- conn }()

	// Держим соединение, читаем ping/pong
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
	return nil
}

// HandleRCON GET /api/v1/rcon — защищённый WS-терминал
func HandleRCON(c echo.Context) error {
	// Проверка API ключа
	apiKey := c.QueryParam("key")
	if apiKey == "" {
		apiKey = c.Request().Header.Get("X-API-Key")
	}
	if apiKey != os.Getenv("API_SECRET_KEY") {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "unauthorized"})
	}

	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer conn.Close()

	// Читаем первое сообщение — выбор сервера
	var authMsg struct {
		ServerID uint `json:"server_id"`
	}
	if err := conn.ReadJSON(&authMsg); err != nil {
		conn.WriteJSON(echo.Map{"error": "invalid init message"}) //nolint:errcheck
		return nil
	}

	var server models.Server
	if err := database.DB.First(&server, authMsg.ServerID).Error; err != nil {
		conn.WriteJSON(echo.Map{"error": "server not found"}) //nolint:errcheck
		return nil
	}

	conn.WriteJSON(echo.Map{ //nolint:errcheck
		"status": "connected",
		"server": server.Title,
	})

	// Обработка RCON команд
	for {
		var cmdMsg struct {
			Command string `json:"command"`
		}
		if err := conn.ReadJSON(&cmdMsg); err != nil {
			break
		}

		// TODO: реализовать реальный RCON (Source RCON Protocol / Minecraft RCON)
		response := fmt.Sprintf("Sent to %s: %s", server.Title, cmdMsg.Command)
		conn.WriteJSON(echo.Map{"output": response}) //nolint:errcheck
	}

	return nil
}
