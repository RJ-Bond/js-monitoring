# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Слой кеша зависимостей: пересобирается только при изменении go.mod
# go.sum генерируется автоматически внутри контейнера если отсутствует в репо
COPY go.mod ./
RUN go mod download

# Копируем весь исходный код и синхронизируем go.sum с реальными импортами
COPY . .
RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux GOAMD64=v1 go build -ldflags="-s -w" -o /bin/server ./cmd/server

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /bin/server .

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:8080/api/v1/stats || exit 1

CMD ["./server"]
