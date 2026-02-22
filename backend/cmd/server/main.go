package main

import (
	"log"
	"net/http"
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
	e.Use(middleware.RateLimiterWithConfig(middleware.RateLimiterConfig{
		Skipper: middleware.DefaultSkipper,
		Store: middleware.NewRateLimiterMemoryStoreWithConfig(
			middleware.RateLimiterMemoryStoreConfig{Rate: 20, Burst: 50, ExpiresIn: 1 * time.Minute},
		),
		IdentifierExtractor: func(c echo.Context) (string, error) {
			return c.RealIP(), nil
		},
		ErrorHandler: func(c echo.Context, err error) error {
			return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "too many requests"})
		},
		DenyHandler: func(c echo.Context, id string, err error) error {
			return c.JSON(http.StatusTooManyRequests, map[string]string{"error": "too many requests"})
		},
	}))
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
	v1.GET("/servers/:id/leaderboard", api.GetLeaderboard)
	v1.GET("/servers/:id/uptime", api.GetUptime)
	v1.GET("/news", api.GetNews)
	v1.GET("/news.rss", api.GetNewsRSS)
	v1.POST("/news/:id/view", api.TrackView)
	v1.GET("/settings", api.GetSettings)
	v1.GET("/users/:username", api.GetPublicProfile)
	v1.GET("/leaderboard", api.GetGlobalLeaderboard)
	v1.GET("/players/:name", api.GetPlayerProfile)

	// ── Auth ─────────────────────────────────────────────────────────────────
	authG := v1.Group("/auth")
	authG.POST("/register", api.Register)
	authG.POST("/login", api.Login)
	authG.GET("/steam", api.SteamInit)
	authG.GET("/steam/callback", api.SteamCallback)
	authG.POST("/reset-password", api.ResetPassword)
	authG.POST("/2fa", api.Verify2FA)

	// ── JWT-protected write routes ────────────────────────────────────────────
	protected := v1.Group("", api.JWTMiddleware)
	protected.POST("/servers", api.CreateServer)
	protected.PUT("/servers/:id", api.UpdateServer)
	protected.DELETE("/servers/:id", api.DeleteServer)
	protected.GET("/profile", api.GetProfile)
	protected.PUT("/profile", api.UpdateProfile)
	protected.PUT("/profile/avatar", api.UpdateAvatar)
	protected.POST("/profile/token", api.GenerateAPIToken)
	protected.DELETE("/profile", api.DeleteProfile)
	protected.GET("/profile/servers", api.GetProfileServers)
	protected.GET("/profile/sessions", api.GetSessions)
	protected.DELETE("/profile/sessions/:id", api.DeleteSession)
	protected.DELETE("/profile/sessions", api.DeleteAllSessions)
	protected.GET("/profile/totp", api.GenerateTOTP)
	protected.POST("/profile/totp/enable", api.EnableTOTP)
	protected.DELETE("/profile/totp", api.DisableTOTP)

	// ── Admin routes (JWT + admin role) ───────────────────────────────────────
	admin := v1.Group("/admin", api.JWTMiddleware, api.AdminMiddleware)
	admin.GET("/users", api.AdminGetUsers)
	admin.PUT("/users/:id", api.AdminUpdateUser)
	admin.DELETE("/users/:id", api.AdminDeleteUser)
	admin.GET("/servers", api.AdminGetServers)
	admin.GET("/news", api.GetAdminNews)
	admin.POST("/news", api.CreateNews)
	admin.PUT("/news/:id", api.UpdateNews)
	admin.DELETE("/news/:id", api.DeleteNews)
	admin.GET("/settings", api.GetAdminSettings)
	admin.PUT("/settings", api.UpdateSettings)
	admin.GET("/alerts/:serverID", api.GetAlertConfig)
	admin.PUT("/alerts/:serverID", api.UpdateAlertConfig)
	admin.POST("/users/:id/reset-token", api.GenerateResetToken)
	admin.GET("/audit", api.GetAuditLog)
	admin.GET("/discord/:serverID", api.GetDiscordConfig)
	admin.PUT("/discord/:serverID", api.UpdateDiscordConfig)
	admin.POST("/discord/:serverID/test", api.SendDiscordTest)
	admin.GET("/export/servers.csv", api.ExportServers)
	admin.GET("/export/players.csv", api.ExportPlayers)
	admin.GET("/export/audit.csv", api.ExportAudit)
	admin.POST("/users/bulk", api.AdminBulkUsers)
	admin.POST("/servers/bulk", api.AdminBulkServers)

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
