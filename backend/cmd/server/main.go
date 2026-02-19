package main

import (
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"

	"github.com/RJ-Bond/js-monitoring/internal/api"
	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
	"github.com/RJ-Bond/js-monitoring/internal/poller"
)

func main() {
	_ = godotenv.Load()

	cfg := database.Config{
		Host:     env("DB_HOST", "localhost"),
		Port:     env("DB_PORT", "3306"),
		User:     env("DB_USER", "root"),
		Password: env("DB_PASSWORD", ""),
		DBName:   env("DB_NAME", "js_monitoring"),
	}

	for i := 0; i < 10; i++ {
		if err := database.Connect(cfg); err == nil {
			break
		} else {
			log.Printf("DB connect attempt %d failed: %v — retrying in 3s", i+1, err)
			time.Sleep(3 * time.Second)
		}
	}
	if database.DB == nil {
		log.Fatal("Could not connect to MySQL after 10 attempts")
	}
	log.Println("Connected to MySQL")

	if err := database.AutoMigrate(); err != nil {
		log.Fatalf("AutoMigrate failed: %v", err)
	}
	log.Println("Database migrated")

	go api.WSHub.Run()

	p := poller.New(func(serverID uint, status *models.ServerStatus) {
		api.WSHub.BroadcastUpdate(serverID, status)
	})
	p.Start()
	defer p.Stop()

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowHeaders: []string{
			echo.HeaderOrigin,
			echo.HeaderContentType,
			echo.HeaderAccept,
			echo.HeaderAuthorization,
			"X-API-Key",
		},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE"},
	}))

	v1 := e.Group("/api/v1")

	// ── Setup (первый запуск) ─────────────────────────────────────────────────
	v1.GET("/setup/status", api.SetupStatus)
	v1.POST("/setup", api.Setup)

	// ── Public read routes ────────────────────────────────────────────────────
	v1.GET("/stats", api.GetStats)
	v1.GET("/ws", api.HandleWebSocket)
	v1.GET("/rcon", api.HandleRCON)
	v1.GET("/servers", api.GetServers)
	v1.GET("/servers/:id", api.GetServer)
	v1.GET("/servers/:id/history", api.GetServerHistory)
	v1.GET("/servers/:id/players", api.GetServerPlayers)
	v1.GET("/news", api.GetNews)

	// ── Auth ─────────────────────────────────────────────────────────────────
	authG := v1.Group("/auth")
	authG.POST("/register", api.Register)
	authG.POST("/login", api.Login)
	authG.GET("/steam", api.SteamInit)
	authG.GET("/steam/callback", api.SteamCallback)

	// ── JWT-protected write routes ────────────────────────────────────────────
	protected := v1.Group("", api.JWTMiddleware)
	protected.POST("/servers", api.CreateServer)
	protected.PUT("/servers/:id", api.UpdateServer)
	protected.DELETE("/servers/:id", api.DeleteServer)

	// ── Admin routes (JWT + admin role) ───────────────────────────────────────
	admin := v1.Group("/admin", api.JWTMiddleware, api.AdminMiddleware)
	admin.GET("/users", api.AdminGetUsers)
	admin.PUT("/users/:id", api.AdminUpdateUser)
	admin.DELETE("/users/:id", api.AdminDeleteUser)
	admin.POST("/news", api.CreateNews)
	admin.PUT("/news/:id", api.UpdateNews)
	admin.DELETE("/news/:id", api.DeleteNews)

	port := env("PORT", "8080")
	log.Printf("Starting server on :%s", port)
	e.Logger.Fatal(e.Start(":" + port))
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
