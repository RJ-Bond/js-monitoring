package api

import (
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string      `json:"token"`
	User  models.User `json:"user"`
}

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "change_me_jwt_secret"
	}
	return []byte(s)
}

func makeToken(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":      user.ID,
		"username": user.Username,
		"role":     user.Role,
		"exp":      time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

// Register POST /api/v1/auth/register
func Register(c echo.Context) error {
	var req registerRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}
	if req.Username == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "username and password are required"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to hash password"})
	}

	// First registered user becomes admin
	var count int64
	database.DB.Model(&models.User{}).Count(&count)
	role := "user"
	if count == 0 {
		role = "admin"
	}

	user := models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         role,
	}

	if err := database.DB.Create(&user).Error; err != nil {
		return c.JSON(http.StatusConflict, echo.Map{"error": "username or email already exists"})
	}

	token, err := makeToken(&user)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token generation failed"})
	}

	return c.JSON(http.StatusCreated, authResponse{Token: token, User: user})
}

// Login POST /api/v1/auth/login
func Login(c echo.Context) error {
	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid request"})
	}

	var user models.User
	if err := database.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "invalid credentials"})
	}

	token, err := makeToken(&user)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token generation failed"})
	}

	return c.JSON(http.StatusOK, authResponse{Token: token, User: user})
}
