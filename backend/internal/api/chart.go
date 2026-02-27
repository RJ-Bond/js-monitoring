package api

import (
	"bytes"
	"net/http"
	"strconv"
	"time"

	chart "github.com/wcharczuk/go-chart/v2"
	"github.com/wcharczuk/go-chart/v2/drawing"

	"github.com/labstack/echo/v4"

	"github.com/RJ-Bond/js-monitoring/internal/database"
	"github.com/RJ-Bond/js-monitoring/internal/models"
)

// GetServerChart GET /api/v1/chart/:serverID?period=24h|7d|30d
// Returns a PNG line chart of player count history. Public, no auth required.
func GetServerChart(c echo.Context) error {
	serverID, err := strconv.Atoi(c.Param("serverID"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, echo.Map{"error": "invalid server id"})
	}

	period := c.QueryParam("period")
	var hours int
	switch period {
	case "7d":
		hours = 168
	case "30d":
		hours = 720
	default:
		hours = 24
		period = "24h"
	}

	since := time.Now().Add(-time.Duration(hours) * time.Hour)

	var history []models.PlayerHistory
	database.DB.
		Where("server_id = ? AND timestamp > ?", serverID, since).
		Order("timestamp ASC").
		Find(&history)

	png, err := renderChart(history, period)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, echo.Map{"error": "chart generation failed"})
	}

	c.Response().Header().Set("Cache-Control", "public, max-age=300")
	return c.Blob(http.StatusOK, "image/png", png)
}

// renderChart generates a PNG chart from PlayerHistory records.
func renderChart(history []models.PlayerHistory, period string) ([]byte, error) {
	bg := drawing.ColorFromHex("0d1117")
	axisColor := drawing.ColorFromHex("4a5568")
	gridColor := drawing.ColorFromHex("1a2332")
	lineColor := drawing.ColorFromHex("00c878")
	fillColor := drawing.ColorFromHex("00c878")

	// Build time-series
	var xValues []time.Time
	var yValues []float64
	for _, h := range history {
		xValues = append(xValues, h.Timestamp)
		count := float64(h.Count)
		if !h.IsOnline {
			count = 0
		}
		yValues = append(yValues, count)
	}

	// Need at least 2 points to render a line
	if len(xValues) < 2 {
		return renderNoDataChart()
	}

	labelCount := 6
	if period == "30d" {
		labelCount = 8
	}

	graph := chart.Chart{
		Width:  800,
		Height: 300,
		Background: chart.Style{
			FillColor: bg,
			Padding: chart.Box{
				Top:    20,
				Left:   10,
				Right:  20,
				Bottom: 10,
			},
		},
		Canvas: chart.Style{
			FillColor: bg,
		},
		XAxis: chart.XAxis{
			ValueFormatter: chart.TimeValueFormatterWithFormat("15:04"),
			GridMajorStyle: chart.Style{
				StrokeColor: gridColor,
				StrokeWidth: 1,
			},
			Style: chart.Style{
				FontColor:   axisColor,
				StrokeColor: axisColor,
				FontSize:    9,
			},
			TickPosition: chart.TickPositionBetweenTicks,
		},
		YAxis: chart.YAxis{
			GridMajorStyle: chart.Style{
				StrokeColor: gridColor,
				StrokeWidth: 1,
			},
			Style: chart.Style{
				FontColor:   axisColor,
				StrokeColor: axisColor,
				FontSize:    9,
			},
		},
		Series: []chart.Series{
			chart.TimeSeries{
				Style: chart.Style{
					StrokeColor: lineColor,
					StrokeWidth: 2.5,
					FillColor:   fillColor.WithAlpha(25),
					DotWidth:    0,
				},
				XValues: xValues,
				YValues: yValues,
			},
		},
	}

	// Auto-sample to ~200 points max to keep chart clean
	if len(xValues) > 200 {
		graph.Series[0] = downsampleSeries(xValues, yValues, 200)
	}

	_ = labelCount // used implicitly by chart internals

	buf := &bytes.Buffer{}
	if err := graph.Render(chart.PNG, buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// renderNoDataChart returns a small dark PNG with "No data" text.
func renderNoDataChart() ([]byte, error) {
	bg := drawing.ColorFromHex("0d1117")
	textColor := drawing.ColorFromHex("4a5568")

	graph := chart.Chart{
		Width:  800,
		Height: 300,
		Background: chart.Style{
			FillColor: bg,
		},
		Canvas: chart.Style{
			FillColor: bg,
		},
		Series: []chart.Series{
			chart.AnnotationSeries{
				Annotations: []chart.Value2{
					{XValue: 0.5, YValue: 0.5, Label: "No data"},
				},
				Style: chart.Style{
					FontColor: textColor,
					FontSize:  14,
				},
			},
		},
	}

	buf := &bytes.Buffer{}
	if err := graph.Render(chart.PNG, buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// downsampleSeries reduces points to ~n by picking evenly-spaced indices.
func downsampleSeries(xs []time.Time, ys []float64, n int) chart.TimeSeries {
	step := float64(len(xs)) / float64(n)
	newX := make([]time.Time, 0, n)
	newY := make([]float64, 0, n)
	for i := 0; i < n; i++ {
		idx := int(float64(i) * step)
		if idx >= len(xs) {
			idx = len(xs) - 1
		}
		newX = append(newX, xs[idx])
		newY = append(newY, ys[idx])
	}
	return chart.TimeSeries{
		Style: chart.Style{
			StrokeColor: drawing.ColorFromHex("00c878"),
			StrokeWidth: 2.5,
			FillColor:   drawing.ColorFromHex("00c878").WithAlpha(25),
		},
		XValues: newX,
		YValues: newY,
	}
}
