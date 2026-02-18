package poller

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"time"

	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// QueryMinecraft выполняет запрос статуса по протоколу Minecraft 1.7+ (JSON handshake)
func QueryMinecraft(ip string, port uint16) (*models.ServerStatus, error) {
	addr := fmt.Sprintf("%s:%d", ip, port)
	conn, err := net.DialTimeout("tcp", addr, udpTimeout)
	if err != nil {
		return nil, fmt.Errorf("connect failed: %w", err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(udpTimeout))

	start := time.Now()

	if err := mcSendHandshake(conn, ip, port); err != nil {
		return nil, fmt.Errorf("handshake failed: %w", err)
	}
	if err := mcSendStatusRequest(conn); err != nil {
		return nil, fmt.Errorf("status request failed: %w", err)
	}

	status, err := mcReadStatusResponse(conn)
	if err != nil {
		return nil, fmt.Errorf("read response failed: %w", err)
	}

	status.PingMS = int(time.Since(start).Milliseconds())
	status.OnlineStatus = true
	return status, nil
}

func mcSendHandshake(conn net.Conn, ip string, port uint16) error {
	var payload bytes.Buffer
	mcWriteVarInt(&payload, 0x00)           // Packet ID: Handshake
	mcWriteVarInt(&payload, 767)            // Protocol version (1.21+)
	mcWriteString(&payload, ip)            // Server address
	binary.Write(&payload, binary.BigEndian, port) //nolint:errcheck
	mcWriteVarInt(&payload, 1)             // Next state: status

	return mcWritePacket(conn, payload.Bytes())
}

func mcSendStatusRequest(conn net.Conn) error {
	var payload bytes.Buffer
	mcWriteVarInt(&payload, 0x00) // Packet ID: Status Request
	return mcWritePacket(conn, payload.Bytes())
}

func mcWritePacket(conn net.Conn, payload []byte) error {
	var buf bytes.Buffer
	mcWriteVarInt(&buf, int32(len(payload)))
	buf.Write(payload)
	_, err := conn.Write(buf.Bytes())
	return err
}

func mcWriteVarInt(w io.Writer, value int32) {
	uval := uint32(value)
	var buf [1]byte
	for uval >= 0x80 {
		buf[0] = byte(uval&0x7F) | 0x80
		w.Write(buf[:]) //nolint:errcheck
		uval >>= 7
	}
	buf[0] = byte(uval)
	w.Write(buf[:]) //nolint:errcheck
}

func mcWriteString(w io.Writer, s string) {
	mcWriteVarInt(w, int32(len(s)))
	w.Write([]byte(s)) //nolint:errcheck
}

func mcReadVarInt(conn net.Conn) (int32, error) {
	var result int32
	var shift uint
	buf := make([]byte, 1)
	for {
		if _, err := conn.Read(buf); err != nil {
			return 0, err
		}
		b := buf[0]
		result |= int32(b&0x7F) << shift
		if b&0x80 == 0 {
			break
		}
		shift += 7
		if shift >= 32 {
			return 0, fmt.Errorf("varint overflow")
		}
	}
	return result, nil
}

type mcStatusJSON struct {
	Players struct {
		Max    int `json:"max"`
		Online int `json:"online"`
	} `json:"players"`
	Version struct {
		Name string `json:"name"`
	} `json:"version"`
}

func mcReadStatusResponse(conn net.Conn) (*models.ServerStatus, error) {
	// Packet length
	if _, err := mcReadVarInt(conn); err != nil {
		return nil, err
	}
	// Packet ID
	if _, err := mcReadVarInt(conn); err != nil {
		return nil, err
	}
	// JSON string length
	jsonLen, err := mcReadVarInt(conn)
	if err != nil {
		return nil, err
	}

	jsonData := make([]byte, jsonLen)
	if _, err := io.ReadFull(conn, jsonData); err != nil {
		return nil, err
	}

	var s mcStatusJSON
	if err := json.Unmarshal(jsonData, &s); err != nil {
		return nil, fmt.Errorf("json parse: %w", err)
	}

	return &models.ServerStatus{
		PlayersNow: s.Players.Online,
		PlayersMax: s.Players.Max,
		CurrentMap: "world",
	}, nil
}
