package notify

import (
	"fmt"
	"net/smtp"
	"os"
	"strconv"
)

// SendEmail отправляет письмо через SMTP.
// Конфигурация из переменных окружения:
//
//	SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS, SMTP_FROM
//
// Если SMTP_HOST не задан, вызов молча игнорируется.
func SendEmail(to, subject, body string) error {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		return nil
	}
	portStr := os.Getenv("SMTP_PORT")
	if portStr == "" {
		portStr = "587"
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		port = 587
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = user
	}

	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, to, subject, body,
	)

	addr := fmt.Sprintf("%s:%d", host, port)
	var auth smtp.Auth
	if user != "" {
		auth = smtp.PlainAuth("", user, pass, host)
	}

	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(msg)); err != nil {
		return fmt.Errorf("smtp: %w", err)
	}
	return nil
}
