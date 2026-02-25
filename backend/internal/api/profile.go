package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

func profileUserID(c echo.Context) uint {
	uid, _ := c.Get("user_id").(float64)
	return uint(uid)
}

// GetProfile GET /api/v1/profile — returns current user's profile
func GetProfile(c echo.Context) error {
	var user models.User
	if err := database.DB.First(&user, profileUserID(c)).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	return c.JSON(http.StatusOK, user)
}

// UpdateProfile PUT /api/v1/profile — update username, email and/or password
func UpdateProfile(c echo.Context) error {
	id := profileUserID(c)

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	var req struct {
		Username        string `json:"username"`
		Email           string `json:"email"`
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}

	updates := map[string]interface{}{}

	if req.Username != "" && req.Username != user.Username {
		updates["username"] = strings.TrimSpace(req.Username)
	}

	currentEmail := ""
	if user.Email != nil {
		currentEmail = *user.Email
	}
	if trimmedEmail := strings.TrimSpace(req.Email); trimmedEmail != currentEmail {
		if trimmedEmail == "" {
			updates["email"] = nil
		} else {
			updates["email"] = trimmedEmail
		}
	}

	if req.NewPassword != "" {
		if user.PasswordHash != "" {
			if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
				return c.JSON(http.StatusUnauthorized, echo.Map{"error": "current password is incorrect"})
			}
		}
		if len(req.NewPassword) < 6 {
			return c.JSON(http.StatusBadRequest, echo.Map{"error": "password must be at least 6 characters"})
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to hash password"})
		}
		updates["password_hash"] = string(hash)
	}

	if len(updates) == 0 {
		return c.JSON(http.StatusOK, user)
	}

	if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
		return c.JSON(http.StatusConflict, echo.Map{"error": "username or email already taken"})
	}

	database.DB.First(&user, id)
	return c.JSON(http.StatusOK, user)
}

// UpdateAvatar PUT /api/v1/profile/avatar — update avatar (base64 data URI) or remove (empty string)
func UpdateAvatar(c echo.Context) error {
	id := profileUserID(c)

	var req struct {
		Avatar string `json:"avatar"`
	}
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}

	if req.Avatar != "" && !strings.HasPrefix(req.Avatar, "data:image/") {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid avatar format"})
	}
	if len(req.Avatar) > 800*1024 {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "avatar too large (max ~600KB)"})
	}

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	if err := database.DB.Model(&user).Update("avatar", req.Avatar).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to update avatar"})
	}
	user.Avatar = req.Avatar
	return c.JSON(http.StatusOK, user)
}

// GenerateAPIToken POST /api/v1/profile/token — generate (or regenerate) personal API token
func GenerateAPIToken(c echo.Context) error {
	id := profileUserID(c)

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to generate token"})
	}
	token := hex.EncodeToString(b)

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}
	if err := database.DB.Model(&user).Update("api_token", token).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to save token"})
	}
	user.APIToken = token
	return c.JSON(http.StatusOK, user)
}

// DeleteProfile DELETE /api/v1/profile — delete own account
func DeleteProfile(c echo.Context) error {
	id := profileUserID(c)

	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	// Prevent deleting the last admin
	if user.Role == "admin" {
		var adminCount int64
		database.DB.Model(&models.User{}).Where("role = ?", "admin").Count(&adminCount)
		if adminCount <= 1 {
			return c.JSON(http.StatusForbidden, echo.Map{"error": "cannot delete the last admin account"})
		}
	}

	// Delete user's servers (and their statuses via cascade or manual)
	database.DB.Where("owner_id = ?", id).Delete(&models.Server{})

	// Delete user
	if err := database.DB.Delete(&models.User{}, id).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to delete account"})
	}
	return c.JSON(http.StatusOK, echo.Map{"message": "account deleted"})
}

// GetProfileServers GET /api/v1/profile/servers — current user's servers with status
func GetProfileServers(c echo.Context) error {
	id := profileUserID(c)
	var servers []models.Server
	if err := database.DB.Preload("Status").Where("owner_id = ?", id).Find(&servers).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, servers)
}

// GetPublicProfile GET /api/v1/users/:username — public profile
func GetPublicProfile(c echo.Context) error {
	username := c.Param("username")
	var user models.User
	if err := database.DB.Where("username = ?", username).First(&user).Error; err != nil {
		return c.JSON(http.StatusNotFound, echo.Map{"error": "user not found"})
	}

	var servers []models.Server
	database.DB.Preload("Status").Where("owner_id = ?", user.ID).Find(&servers)

	return c.JSON(http.StatusOK, echo.Map{
		"id":         user.ID,
		"username":   user.Username,
		"avatar":     user.Avatar,
		"role":       user.Role,
		"created_at": user.CreatedAt,
		"servers":    servers,
	})
}
