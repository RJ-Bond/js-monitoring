package api

import (
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// AdminGetUsers GET /api/v1/admin/users — list all users with server_count
func AdminGetUsers(c echo.Context) error {
	type userWithCount struct {
		models.User
		ServerCount int `json:"server_count"`
	}

	var users []models.User
	if err := database.DB.Order("created_at ASC").Find(&users).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	type countRow struct {
		OwnerID uint
		Count   int
	}
	var rows []countRow
	database.DB.Model(&models.Server{}).
		Select("owner_id, count(*) as count").
		Group("owner_id").
		Scan(&rows)

	countOf := map[uint]int{}
	for _, r := range rows {
		countOf[r.OwnerID] = r.Count
	}

	result := make([]userWithCount, len(users))
	for i, u := range users {
		result[i] = userWithCount{User: u, ServerCount: countOf[u.ID]}
	}
	return c.JSON(http.StatusOK, result)
}

// AdminUpdateUser PUT /api/v1/admin/users/:id — ban/unban or change role
func AdminUpdateUser(c echo.Context) error {
	id := c.Param("id")

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	var payload struct {
		Role   *string `json:"role"`
		Banned *bool   `json:"banned"`
	}
	if err := c.Bind(&payload); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": err.Error()})
	}

	callerID := uint(0)
	if v, ok := c.Get("user_id").(float64); ok {
		callerID = uint(v)
	}
	if callerID == user.ID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "cannot modify your own account"})
	}

	updates := map[string]interface{}{}
	if payload.Role != nil {
		updates["role"] = *payload.Role
	}
	if payload.Banned != nil {
		updates["banned"] = *payload.Banned
	}
	if len(updates) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "no fields to update"})
	}

	if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	database.DB.First(&user, id)
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "update_user", "user", user.ID, user.Username)
	}
	return c.JSON(http.StatusOK, user)
}

// AdminDeleteUser DELETE /api/v1/admin/users/:id
func AdminDeleteUser(c echo.Context) error {
	id := c.Param("id")

	callerID := uint(0)
	if v, ok := c.Get("user_id").(float64); ok {
		callerID = uint(v)
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if callerID == user.ID {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "cannot delete your own account"})
	}

	database.DB.Delete(&user)
	{
		aid, aname := actorFromCtx(c)
		logAudit(aid, aname, "delete_user", "user", user.ID, user.Username)
	}
	return c.JSON(http.StatusOK, echo.Map{"message": "user deleted"})
}

// AdminBulkUsers POST /api/v1/admin/users/bulk — bulk ban/unban/delete users
func AdminBulkUsers(c echo.Context) error {
	var req struct {
		Action string `json:"action"` // "ban", "unban", "delete"
		IDs    []uint `json:"ids"`
	}
	if err := c.Bind(&req); err != nil || len(req.IDs) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "action and ids required"})
	}

	callerID := uint(0)
	if v, ok := c.Get("user_id").(float64); ok {
		callerID = uint(v)
	}

	// Remove caller from IDs to prevent self-action
	safeIDs := make([]uint, 0, len(req.IDs))
	for _, id := range req.IDs {
		if id != callerID {
			safeIDs = append(safeIDs, id)
		}
	}
	if len(safeIDs) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "no valid ids"})
	}

	switch req.Action {
	case "ban":
		database.DB.Model(&models.User{}).Where("id IN ?", safeIDs).Update("banned", true)
	case "unban":
		database.DB.Model(&models.User{}).Where("id IN ?", safeIDs).Update("banned", false)
	case "delete":
		database.DB.Where("id IN ?", safeIDs).Delete(&models.User{})
	default:
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "unknown action"})
	}

	aid, aname := actorFromCtx(c)
	logAudit(aid, aname, "bulk_"+req.Action+"_users", "user", 0, fmt.Sprintf("%v", safeIDs))
	return c.JSON(http.StatusOK, echo.Map{"ok": true, "count": len(safeIDs)})
}

// AdminBulkServers POST /api/v1/admin/servers/bulk — bulk delete servers
func AdminBulkServers(c echo.Context) error {
	var req struct {
		Action string `json:"action"` // "delete"
		IDs    []uint `json:"ids"`
	}
	if err := c.Bind(&req); err != nil || len(req.IDs) == 0 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "action and ids required"})
	}
	if req.Action != "delete" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "unknown action"})
	}

	database.DB.Where("id IN ?", req.IDs).Delete(&models.Server{})

	aid, aname := actorFromCtx(c)
	logAudit(aid, aname, "bulk_delete_servers", "server", 0, fmt.Sprintf("%v", req.IDs))
	return c.JSON(http.StatusOK, echo.Map{"ok": true, "count": len(req.IDs)})
}

// AdminGetServers GET /api/v1/admin/servers — list all servers with owner name
func AdminGetServers(c echo.Context) error {
	type adminServerResp struct {
		models.Server
		OwnerName string `json:"owner_name"`
	}

	var servers []models.Server
	if err := database.DB.Preload("Status").Order("created_at DESC").Find(&servers).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}

	// Batch-fetch owner usernames
	seen := map[uint]bool{}
	ownerIDs := make([]uint, 0, len(servers))
	for _, s := range servers {
		if !seen[s.OwnerID] {
			ownerIDs = append(ownerIDs, s.OwnerID)
			seen[s.OwnerID] = true
		}
	}
	var users []models.User
	if len(ownerIDs) > 0 {
		database.DB.Select("id, username").Where("id IN ?", ownerIDs).Find(&users)
	}
	nameOf := map[uint]string{}
	for _, u := range users {
		nameOf[u.ID] = u.Username
	}

	result := make([]adminServerResp, len(servers))
	for i, s := range servers {
		result[i] = adminServerResp{Server: s, OwnerName: nameOf[s.OwnerID]}
	}
	return c.JSON(http.StatusOK, result)
}
