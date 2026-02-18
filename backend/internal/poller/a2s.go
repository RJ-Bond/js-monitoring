package poller

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"github.com/RJ-Bond/js-monitoring/internal/models"
)

const (
	udpTimeout = 3 * time.Second
	// A2S_INFO challenge request
	a2sChallenge = "\xFF\xFF\xFF\xFF\x54Source Engine Query\x00"
)

// QuerySource выполняет A2S_INFO запрос к Source-совместимому серверу (CS2, TF2, Rust и т.д.)
func QuerySource(ip string, port uint16) (*models.ServerStatus, error) {
	addr := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("udp", addr, udpTimeout)
	if err != nil {
		return nil, fmt.Errorf("dial failed: %w", err)
	}
	defer conn.Close()

	if err := conn.SetDeadline(time.Now().Add(udpTimeout)); err != nil {
		return nil, err
	}

	start := time.Now()
	if _, err = conn.Write([]byte(a2sChallenge)); err != nil {
		return nil, fmt.Errorf("write failed: %w", err)
	}

	buf := make([]byte, 1400)
	n, err := conn.Read(buf)
	if err != nil {
		return nil, fmt.Errorf("read failed: %w", err)
	}
	pingMS := int(time.Since(start).Milliseconds())

	data := buf[:n]

	// Некоторые серверы требуют challenge ответа
	if len(data) >= 9 && data[4] == 0x41 {
		// Получили challenge number, повторяем с ним
		challenge := data[5:9]
		request := append([]byte("\xFF\xFF\xFF\xFF\x54Source Engine Query\x00"), challenge...)
		if _, err = conn.Write(request); err != nil {
			return nil, err
		}
		n, err = conn.Read(buf)
		if err != nil {
			return nil, err
		}
		data = buf[:n]
	}

	return parseA2SInfo(data, pingMS)
}

func parseA2SInfo(data []byte, pingMS int) (*models.ServerStatus, error) {
	if len(data) < 6 {
		return nil, fmt.Errorf("response too short: %d bytes", len(data))
	}

	r := bytes.NewReader(data)

	// 4 bytes FF FF FF FF header
	header := make([]byte, 4)
	if _, err := r.Read(header); err != nil {
		return nil, err
	}

	var msgType byte
	if err := binary.Read(r, binary.LittleEndian, &msgType); err != nil {
		return nil, err
	}
	if msgType != 0x49 {
		return nil, fmt.Errorf("unexpected response type: 0x%02X (expected 0x49)", msgType)
	}

	// Protocol version
	var protocol byte
	binary.Read(r, binary.LittleEndian, &protocol) //nolint:errcheck

	// Strings: name, map, folder, game
	_ = readNullString(r) // server name
	mapName := readNullString(r)
	_ = readNullString(r) // folder
	_ = readNullString(r) // game

	// App ID
	var appID uint16
	binary.Read(r, binary.LittleEndian, &appID) //nolint:errcheck

	// Players
	var playersNow, playersMax, bots byte
	binary.Read(r, binary.LittleEndian, &playersNow) //nolint:errcheck
	binary.Read(r, binary.LittleEndian, &playersMax) //nolint:errcheck
	binary.Read(r, binary.LittleEndian, &bots)       //nolint:errcheck

	return &models.ServerStatus{
		OnlineStatus: true,
		PlayersNow:   int(playersNow),
		PlayersMax:   int(playersMax),
		CurrentMap:   mapName,
		PingMS:       pingMS,
	}, nil
}

func readNullString(r *bytes.Reader) string {
	var out []byte
	for {
		b, err := r.ReadByte()
		if err != nil || b == 0 {
			break
		}
		out = append(out, b)
	}
	return string(out)
}
