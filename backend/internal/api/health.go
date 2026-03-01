package api

import (
	"net/http"
	"runtime"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
)

var appStartTime = time.Now()

// GetSystemHealth GET /api/v1/admin/health — метрики Go-процесса и соединений.
func GetSystemHealth(c echo.Context) error {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	sqlDB, err := database.DB.DB()
	dbStats := struct {
		OpenConnections int
		InUse           int
		Idle            int
	}{}
	if err == nil {
		s := sqlDB.Stats()
		dbStats.OpenConnections = s.OpenConnections
		dbStats.InUse = s.InUse
		dbStats.Idle = s.Idle
	}

	WSHub.mu.RLock()
	wsConns := len(WSHub.clients)
	WSHub.mu.RUnlock()

	uptimeSec := int64(time.Since(appStartTime).Seconds())

	return c.JSON(http.StatusOK, echo.Map{
		"uptime_seconds":    uptimeSec,
		"goroutines":        runtime.NumGoroutine(),
		"memory_alloc_mb":   mem.Alloc / 1024 / 1024,
		"memory_sys_mb":     mem.Sys / 1024 / 1024,
		"gc_runs":           mem.NumGC,
		"ws_connections":    wsConns,
		"db_open_conns":     dbStats.OpenConnections,
		"db_in_use":         dbStats.InUse,
		"db_idle":           dbStats.Idle,
		"go_version":        runtime.Version(),
	})
}
