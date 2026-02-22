package api

import "github.com/RJ-Bond/js-monitoring/internal/notify"

// SendEmail — обёртка над notify.SendEmail для использования в api-хендлерах.
func SendEmail(to, subject, body string) error {
	return notify.SendEmail(to, subject, body)
}
