package api

import (
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GetSSLStatus GET /api/v1/admin/ssl/status — возвращает статус SSL-сертификата.
// Читает cert из /etc/letsencrypt (Let's Encrypt) или /etc/nginx/ssl (custom).
// Также возвращает последние 10 строк лога certbot.
func GetSSLStatus(c echo.Context) error {
	var s models.SiteSettings
	database.DB.First(&s, 1)

	result := echo.Map{
		"mode":        s.SSLMode,
		"domain":      s.SSLDomain,
		"force_https": s.ForceHTTPS,
	}

	// Определяем путь к сертификату по режиму SSL
	certPath := ""
	switch s.SSLMode {
	case "letsencrypt":
		if s.SSLDomain != "" {
			certPath = "/etc/letsencrypt/live/" + s.SSLDomain + "/cert.pem"
		}
	case "custom":
		certPath = "/etc/nginx/ssl/fullchain.pem"
	}

	// Парсим cert и извлекаем дату истечения
	if certPath != "" {
		if data, err := os.ReadFile(certPath); err == nil {
			block, _ := pem.Decode(data)
			if block != nil {
				if cert, err := x509.ParseCertificate(block.Bytes); err == nil {
					daysLeft := int(cert.NotAfter.Sub(time.Now()).Hours() / 24)
					result["expires_at"] = cert.NotAfter.Format(time.RFC3339)
					result["days_remaining"] = daysLeft
					result["issuer"] = cert.Issuer.CommonName
				}
			}
		}
	}

	// Последние 10 строк лога certbot
	if logData, err := os.ReadFile("/var/log/letsencrypt/letsencrypt.log"); err == nil {
		lines := strings.Split(strings.TrimSpace(string(logData)), "\n")
		start := len(lines) - 10
		if start < 0 {
			start = 0
		}
		result["certbot_logs"] = lines[start:]
	}

	return c.JSON(http.StatusOK, result)
}
