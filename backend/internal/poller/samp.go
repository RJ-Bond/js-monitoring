package poller

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// QuerySAMP опрашивает SA-MP/open.mp сервер по UDP (пакет 'i' — информация)
func QuerySAMP(ip string, port uint16) (*models.ServerStatus, error) {
	parts := strings.Split(ip, ".")
	if len(parts) != 4 {
		return nil, fmt.Errorf("invalid IPv4 address: %s", ip)
	}

	addr := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("udp", addr, 3*time.Second)
	if err != nil {
		return nil, fmt.Errorf("udp dial: %w", err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(3 * time.Second)) //nolint:errcheck

	// Формируем пакет запроса
	var buf bytes.Buffer
	buf.WriteString("SAMP")
	for _, p := range parts {
		n, _ := strconv.Atoi(p)
		buf.WriteByte(byte(n))
	}
	// Порт в little-endian
	buf.WriteByte(byte(port & 0xFF))
	buf.WriteByte(byte(port >> 8))
	buf.WriteByte('i') // тип пакета: info

	start := time.Now()
	if _, err := conn.Write(buf.Bytes()); err != nil {
		return nil, fmt.Errorf("write: %w", err)
	}

	resp := make([]byte, 512)
	n, err := conn.Read(resp)
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	pingMS := int(time.Since(start).Milliseconds())

	// Проверяем заголовок ответа: "SAMP" + IP(4) + Port(2) + PacketType(1) = 11 bytes
	if n < 12 || string(resp[:4]) != "SAMP" {
		return nil, fmt.Errorf("invalid SAMP response (len=%d)", n)
	}

	r := bytes.NewReader(resp[11:])

	var password uint8
	binary.Read(r, binary.LittleEndian, &password) //nolint:errcheck

	var players, maxPlayers uint16
	binary.Read(r, binary.LittleEndian, &players)    //nolint:errcheck
	binary.Read(r, binary.LittleEndian, &maxPlayers) //nolint:errcheck

	// Читаем hostname (4 байта длина + строка)
	var hostnameLen uint32
	binary.Read(r, binary.LittleEndian, &hostnameLen) //nolint:errcheck
	if hostnameLen > 256 {
		hostnameLen = 256
	}
	hostname := make([]byte, hostnameLen)
	r.Read(hostname) //nolint:errcheck

	// Читаем gamemode
	var gamemodeLen uint32
	binary.Read(r, binary.LittleEndian, &gamemodeLen) //nolint:errcheck
	if gamemodeLen > 64 {
		gamemodeLen = 64
	}
	gamemode := make([]byte, gamemodeLen)
	r.Read(gamemode) //nolint:errcheck

	return &models.ServerStatus{
		OnlineStatus: true,
		PlayersNow:   int(players),
		PlayersMax:   int(maxPlayers),
		CurrentMap:   string(gamemode),
		PingMS:       pingMS,
	}, nil
}
