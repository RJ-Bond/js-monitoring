package api

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
	xdraw "golang.org/x/image/draw"
	"golang.org/x/image/webp"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

const vrMapSize = 512

// RenderVRisingMapPNG GET /api/v1/servers/:id/vrising/map-render — public
// Generates a PNG image of the V Rising live map with player/castle positions overlaid.
func RenderVRisingMapPNG(c echo.Context) error {
	serverID, err := strconv.Atoi(c.Param("id"))
	if err != nil || serverID <= 0 {
		return c.NoContent(http.StatusBadRequest)
	}

	var mapData models.VRisingMapData
	if database.DB.Where("server_id = ?", serverID).First(&mapData).Error != nil {
		return c.NoContent(http.StatusNotFound)
	}

	var payload VRisingMapPayload
	if err := json.Unmarshal([]byte(mapData.Data), &payload); err != nil {
		return c.NoContent(http.StatusInternalServerError)
	}

	var s models.SiteSettings
	database.DB.First(&s, 1)

	pngBytes, err := buildVRisingMapPNG(payload, s)
	if err != nil {
		return c.NoContent(http.StatusInternalServerError)
	}

	c.Response().Header().Set("Cache-Control", "public, max-age=30")
	return c.Blob(http.StatusOK, "image/png", pngBytes)
}

func buildVRisingMapPNG(payload VRisingMapPayload, s models.SiteSettings) ([]byte, error) {
	img := image.NewRGBA(image.Rect(0, 0, vrMapSize, vrMapSize))

	// Dark background
	bgCol := color.RGBA{13, 17, 23, 255}
	draw.Draw(img, img.Bounds(), &image.Uniform{bgCol}, image.Point{}, draw.Src)

	// Map background image
	if s.VRisingMapImage != "" {
		if bg, err := vrDecodeBase64Image(s.VRisingMapImage); err == nil {
			dst := image.Rect(0, 0, vrMapSize, vrMapSize)
			xdraw.BiLinear.Scale(img, dst, bg, bg.Bounds(), draw.Over, nil)
		}
	}

	// Semi-transparent dark vignette for readability
	darkOverlay := image.NewUniform(color.RGBA{0, 0, 0, 40})
	draw.Draw(img, img.Bounds(), darkOverlay, image.Point{}, draw.Over)

	// World bounds
	xMin := float32(effectiveWorldBound(s.VRisingWorldXMin, -2880))
	xMax := float32(effectiveWorldBound(s.VRisingWorldXMax, 160))
	zMin := float32(effectiveWorldBound(s.VRisingWorldZMin, -2400))
	zMax := float32(effectiveWorldBound(s.VRisingWorldZMax, 640))

	toPixel := func(gx, gz float32) (int, int) {
		px := int((gx - xMin) / (xMax - xMin) * vrMapSize)
		py := int((zMax - gz) / (zMax - zMin) * vrMapSize)
		return clampI(px, 0, vrMapSize-1), clampI(py, 0, vrMapSize-1)
	}

	// Castle icon (custom or default)
	var castleIconImg image.Image
	if s.VRisingCastleIcon != "" {
		castleIconImg, _ = vrDecodeBase64Image(s.VRisingCastleIcon)
	}

	// Player icon (custom or default)
	var playerIconImg image.Image
	if s.VRisingPlayerIcon != "" {
		playerIconImg, _ = vrDecodeBase64Image(s.VRisingPlayerIcon)
	}

	// Draw free plots (green outline circles, below castles/players)
	// Skip plots outside configured world bounds (territories on other parts of the map)
	freePlotCol := color.RGBA{34, 197, 94, 160} // green-500
	for _, plot := range payload.FreePlots {
		if plot.X < xMin || plot.X > xMax || plot.Z < zMin || plot.Z > zMax {
			continue
		}
		px, py := toPixel(plot.X, plot.Z)
		vrDrawCircleOutline(img, px, py, 10, 2, freePlotCol)
	}

	// Draw castles
	for _, castle := range payload.Castles {
		px, py := toPixel(castle.X, castle.Z)
		label := castle.Clan
		if label == "" {
			label = castle.Owner
		}
		col := vrHashColor(label)

		if castleIconImg != nil {
			vrDrawIcon(img, castleIconImg, px, py, 20)
		} else {
			vrDrawFilledRect(img, px-5, py-5, 10, 10, col)
		}
	}

	// Draw players
	for _, player := range payload.Players {
		px, py := toPixel(player.X, player.Z)
		label := player.Clan
		if label == "" {
			label = player.Name
		}
		col := vrHashColor(label)

		if playerIconImg != nil {
			vrDrawIcon(img, playerIconImg, px, py, 16)
		} else {
			vrDrawFilledCircle(img, px, py, 5, col)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// vrDecodeBase64Image decodes a data URL "data:<mime>;base64,<data>" into image.Image.
func vrDecodeBase64Image(dataURL string) (image.Image, error) {
	comma := strings.Index(dataURL, ",")
	if comma < 0 {
		return nil, nil
	}
	header := dataURL[:comma]
	encoded := dataURL[comma+1:]

	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}

	r := bytes.NewReader(raw)
	if strings.Contains(header, "webp") {
		return webp.Decode(r)
	}
	if strings.Contains(header, "jpeg") || strings.Contains(header, "jpg") {
		return jpeg.Decode(r)
	}
	return png.Decode(r)
}

// vrDrawIcon composites a pre-decoded icon image centered at (cx, cy) scaled to iconSize×iconSize.
func vrDrawIcon(dst *image.RGBA, src image.Image, cx, cy, iconSize int) {
	scaled := image.NewRGBA(image.Rect(0, 0, iconSize, iconSize))
	xdraw.BiLinear.Scale(scaled, scaled.Bounds(), src, src.Bounds(), draw.Over, nil)
	offset := image.Pt(cx-iconSize/2, cy-iconSize/2)
	draw.Draw(dst, image.Rect(offset.X, offset.Y, offset.X+iconSize, offset.Y+iconSize), scaled, image.Point{}, draw.Over)
}

// vrDrawFilledCircle draws a filled circle using a simple distance check.
func vrDrawFilledCircle(img *image.RGBA, cx, cy, r int, col color.Color) {
	for dy := -r; dy <= r; dy++ {
		for dx := -r; dx <= r; dx++ {
			if dx*dx+dy*dy <= r*r {
				img.Set(cx+dx, cy+dy, col)
			}
		}
	}
}

// vrDrawCircleOutline draws a circle outline with the given thickness.
func vrDrawCircleOutline(img *image.RGBA, cx, cy, r, thickness int, col color.Color) {
	rOuter := r + thickness/2
	rInner := r - thickness/2
	if rInner < 0 {
		rInner = 0
	}
	for dy := -rOuter; dy <= rOuter; dy++ {
		for dx := -rOuter; dx <= rOuter; dx++ {
			d2 := dx*dx + dy*dy
			if d2 <= rOuter*rOuter && d2 >= rInner*rInner {
				img.Set(cx+dx, cy+dy, col)
			}
		}
	}
}

// vrDrawFilledRect draws a filled axis-aligned rectangle.
func vrDrawFilledRect(img *image.RGBA, x, y, w, h int, col color.Color) {
	for dy := 0; dy < h; dy++ {
		for dx := 0; dx < w; dx++ {
			img.Set(x+dx, y+dy, col)
		}
	}
}

// vrHashColor returns a deterministic bright color from a string (clan or player name).
func vrHashColor(s string) color.RGBA {
	var h uint32
	for i := 0; i < len(s); i++ {
		h = uint32(s[i]) + ((h << 5) - h)
	}
	hue := float64(h%360) / 360.0
	r, g, b := vrHSLToRGB(hue, 0.75, 0.60)
	return color.RGBA{r, g, b, 230}
}

// vrHSLToRGB converts HSL [0,1] to RGB [0,255].
func vrHSLToRGB(h, s, l float64) (uint8, uint8, uint8) {
	var r, g, b float64
	if s == 0 {
		r, g, b = l, l, l
	} else {
		q := l + s - l*s
		if l < 0.5 {
			q = l * (1 + s)
		}
		p := 2*l - q
		r = vrHue2RGB(p, q, h+1.0/3.0)
		g = vrHue2RGB(p, q, h)
		b = vrHue2RGB(p, q, h-1.0/3.0)
	}
	return uint8(r * 255), uint8(g * 255), uint8(b * 255)
}

func vrHue2RGB(p, q, t float64) float64 {
	if t < 0 { t += 1 }
	if t > 1 { t -= 1 }
	switch {
	case t < 1.0/6.0: return p + (q-p)*6*t
	case t < 1.0/2.0: return q
	case t < 2.0/3.0: return p + (q-p)*(2.0/3.0-t)*6
	}
	return p
}

func clampI(v, lo, hi int) int {
	if v < lo { return lo }
	if v > hi { return hi }
	return v
}
