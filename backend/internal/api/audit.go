package api

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// actorFromCtx извлекает ID и имя актора из JWT-контекста
func actorFromCtx(c echo.Context) (uint, string) {
	uid, _ := c.Get("user_id").(float64)
	name, _ := c.Get("username").(string)
	return uint(uid), name
}

// logAudit — fire-and-forget запись в журнал аудита
func logAudit(actorID uint, actorName, action, entityType string, entityID uint, details string) {
	go database.DB.Create(&models.AuditLog{
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		Details:    details,
	})
}

// GetAuditLog GET /api/v1/admin/audit?page=1&entity_type=server
func GetAuditLog(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	if page < 1 {
		page = 1
	}
	const limit = 50
	offset := (page - 1) * limit

	entityType := c.QueryParam("entity_type")

	q := database.DB.Model(&models.AuditLog{})
	if entityType != "" {
		q = q.Where("entity_type = ?", entityType)
	}

	var total int64
	q.Count(&total)

	var logs []models.AuditLog
	q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&logs)

	if logs == nil {
		logs = []models.AuditLog{}
	}
	return c.JSON(http.StatusOK, echo.Map{"items": logs, "total": total})
}
