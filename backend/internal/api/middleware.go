package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// JWTMiddleware validates Bearer token in Authorization header.
// Checks SessionsClearedAt to support "logout all" invalidation.
func JWTMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Allow API key as alternative auth
		if key := c.Request().Header.Get("X-API-Key"); key != "" {
			return apiKeyAuth(c, key, next)
		}

		auth := c.Request().Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			return c.JSON(http.StatusUnauthorized, echo.Map{"error": "missing or invalid authorization header"})
		}
		tokenStr := strings.TrimPrefix(auth, "Bearer ")

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return jwtSecret(), nil
		})
		if err != nil || !token.Valid {
			return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid or expired token"})
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid token claims"})
		}

		// Check SessionsClearedAt: if user cleared all sessions, iat must be newer
		if sub, ok := claims["sub"].(float64); ok {
			userID := uint(sub)
			var user models.User
			if database.DB.Select("id, sessions_cleared_at, banned").First(&user, userID).Error == nil {
				if user.Banned {
					return c.JSON(http.StatusForbidden, echo.Map{"error": "account is banned"})
				}
				if user.SessionsClearedAt != nil {
					iatF, _ := claims["iat"].(float64)
					iat := time.Unix(int64(iatF), 0)
					if iat.Before(*user.SessionsClearedAt) {
						return c.JSON(http.StatusUnauthorized, echo.Map{"error": "session invalidated"})
					}
				}
			}
		}

		c.Set("user_id", claims["sub"])
		c.Set("username", claims["username"])
		c.Set("role", claims["role"])
		c.Set("jti", claims["jti"])

		// Update LastUsedAt async
		if jti, _ := claims["jti"].(string); jti != "" {
			go database.DB.Model(&models.UserSession{}).Where("jti = ?", jti).
				Update("last_used_at", time.Now())
		}

		return next(c)
	}
}

func apiKeyAuth(c echo.Context, key string, next echo.HandlerFunc) error {
	var user models.User
	if err := database.DB.Where("api_token = ? AND banned = false", key).First(&user).Error; err != nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid api key"})
	}
	c.Set("user_id", float64(user.ID))
	c.Set("username", user.Username)
	c.Set("role", user.Role)
	return next(c)
}

// AdminMiddleware requires role == "admin"
func AdminMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		role, _ := c.Get("role").(string)
		if role != "admin" {
			return c.JSON(http.StatusForbidden, echo.Map{"error": "admin access required"})
		}
		return next(c)
	}
}

// BanCheckMiddleware blocks banned users from write operations
func BanCheckMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Banned flag is not stored in JWT; check is done in handlers that need it.
		// This middleware slot is reserved for future use.
		return next(c)
	}
}
