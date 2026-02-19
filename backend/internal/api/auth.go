package api

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
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

// SetupStatus GET /api/v1/setup/status — публичный, возвращает нужна ли начальная настройка
func SetupStatus(c echo.Context) error {
	var count int64
	database.DB.Model(&models.User{}).Count(&count)
	return c.JSON(http.StatusOK, echo.Map{"needed": count == 0})
}

// Setup POST /api/v1/setup — создаёт первого администратора (только если нет пользователей)
func Setup(c echo.Context) error {
	var count int64
	database.DB.Model(&models.User{}).Count(&count)
	if count != 0 {
		return c.JSON(http.StatusConflict, echo.Map{"error": "setup already completed"})
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.Bind(&req); err != nil || req.Username == "" || req.Password == "" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "username and password required"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to hash password"})
	}

	user := models.User{Username: req.Username, PasswordHash: string(hash), Role: "admin"}
	if err := database.DB.Create(&user).Error; err != nil {
		return c.JSON(http.StatusConflict, echo.Map{"error": "username already exists"})
	}

	token, err := makeToken(&user)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token generation failed"})
	}
	return c.JSON(http.StatusCreated, authResponse{Token: token, User: user})
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
	if user.Banned {
		return c.JSON(http.StatusForbidden, echo.Map{"error": "account is banned"})
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

// ─── Steam OpenID 2.0 ────────────────────────────────────────────────────────

func appURL() string {
	u := os.Getenv("APP_URL")
	if u == "" {
		u = "http://localhost"
	}
	return strings.TrimRight(u, "/")
}

// SteamInit GET /api/v1/auth/steam — redirects browser to Steam OpenID login
func SteamInit(c echo.Context) error {
	realm := appURL()
	returnTo := realm + "/api/v1/auth/steam/callback"

	params := url.Values{
		"openid.ns":         {"http://specs.openid.net/auth/2.0"},
		"openid.mode":       {"checkid_setup"},
		"openid.return_to":  {returnTo},
		"openid.realm":      {realm},
		"openid.identity":   {"http://specs.openid.net/auth/2.0/identifier_select"},
		"openid.claimed_id": {"http://specs.openid.net/auth/2.0/identifier_select"},
	}
	return c.Redirect(http.StatusFound, "https://steamcommunity.com/openid/login?"+params.Encode())
}

// SteamCallback GET /api/v1/auth/steam/callback — verifies Steam OpenID response
func SteamCallback(c echo.Context) error {
	q := c.Request().URL.Query()
	if q.Get("openid.mode") != "id_res" {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "steam auth cancelled or failed"})
	}

	// Verify with Steam
	steamID, err := verifySteamOpenID(q)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, echo.Map{"error": "steam verification failed: " + err.Error()})
	}

	// Get Steam profile (persona name + avatar)
	username, avatar := getSteamProfile(steamID)

	// Find or create user by steam_id
	var user models.User
	result := database.DB.Where("steam_id = ?", steamID).First(&user)
	if result.Error != nil {
		// New Steam user
		var count int64
		database.DB.Model(&models.User{}).Count(&count)
		role := "user"
		if count == 0 {
			role = "admin"
		}
		user = models.User{
			Username: username,
			SteamID:  steamID,
			Role:     role,
		}
		_ = avatar // stored for future avatar field
		if err := database.DB.Create(&user).Error; err != nil {
			// Username collision — append steamID suffix
			user.Username = fmt.Sprintf("%s_%s", username, steamID[len(steamID)-4:])
			if err2 := database.DB.Create(&user).Error; err2 != nil {
				return c.JSON(http.StatusInternalServerError, echo.Map{"error": "failed to create user"})
			}
		}
	} else if user.Banned {
		return c.Redirect(http.StatusFound, appURL()+"/login?error=banned")
	}

	token, err := makeToken(&user)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "token generation failed"})
	}

	// Redirect frontend to /auth/steam?token=...
	return c.Redirect(http.StatusFound, appURL()+"/auth/steam?token="+url.QueryEscape(token))
}

func verifySteamOpenID(params url.Values) (string, error) {
	// Build verification request — same params but mode=check_authentication
	verify := url.Values{}
	for k, v := range params {
		verify[k] = v
	}
	verify.Set("openid.mode", "check_authentication")

	resp, err := http.PostForm("https://steamcommunity.com/openid/login", verify)
	if err != nil {
		return "", fmt.Errorf("steam verify request: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "is_valid:true") {
		return "", fmt.Errorf("steam says not valid")
	}

	// Extract Steam64 ID from claimed_id: https://steamcommunity.com/openid/id/{steamid64}
	re := regexp.MustCompile(`/openid/id/(\d+)$`)
	matches := re.FindStringSubmatch(params.Get("openid.claimed_id"))
	if len(matches) < 2 {
		return "", fmt.Errorf("cannot extract steam id from claimed_id")
	}
	return matches[1], nil
}

func getSteamProfile(steamID string) (username, avatar string) {
	apiKey := os.Getenv("STEAM_API_KEY")
	if apiKey == "" {
		return "steam_" + steamID[len(steamID)-8:], ""
	}

	apiURL := fmt.Sprintf(
		"https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=%s&steamids=%s",
		apiKey, steamID,
	)
	resp, err := http.Get(apiURL) //nolint:noctx
	if err != nil {
		return "steam_" + steamID[len(steamID)-8:], ""
	}
	defer resp.Body.Close()

	// Minimal JSON parse — avoid heavy dependency
	body, _ := io.ReadAll(resp.Body)
	s := string(body)

	name := extractJSON(s, "personaname")
	if name == "" {
		name = "steam_" + steamID[len(steamID)-8:]
	}
	return name, extractJSON(s, "avatarfull")
}

// extractJSON is a minimal "get string field" helper to avoid importing encoding/json
func extractJSON(s, key string) string {
	needle := `"` + key + `":"`
	idx := strings.Index(s, needle)
	if idx < 0 {
		return ""
	}
	start := idx + len(needle)
	end := strings.Index(s[start:], `"`)
	if end < 0 {
		return ""
	}
	return s[start : start+end]
}
