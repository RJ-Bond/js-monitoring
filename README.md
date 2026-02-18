# JS Monitor — Game Server Dashboard

High-End мониторинг игровых серверов: Go backend + Next.js 15 frontend + MySQL 8.4.

## Features

- **Smart Poller** — адаптивный опрос: 10 сек (активная игра) / 60 сек (пустой сервер)
- **Real-time WebSockets** — мгновенное обновление статуса без перезагрузки страницы
- **Source A2S + Minecraft Query** — поддержка CS2, TF2, Rust, Minecraft, FiveM
- **RCON Web Console** — защищённый терминал прямо в браузере
- **Auto-Join** — кнопка "Play" генерирует `steam://`, `minecraft://`, `fivem://`
- **Analytics** — графики онлайна за 24h / 7d / 30d (Recharts)
- **Telegram Alerts** — мгновенные уведомления о падении серверов
- **Glassmorphism UI** — Cyberpunk Minimal дизайн с neon-эффектами

## Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Go 1.24, Echo v4, GORM              |
| Database  | MySQL 8.4 LTS                       |
| Frontend  | Next.js 15, shadcn/ui, Tailwind CSS |
| Charts    | Recharts                            |
| Real-time | WebSocket (gorilla/websocket)       |
| Infra     | Docker, Nginx, systemd              |

## Quick Start (Docker)

```bash
# 1. Clone
git clone https://github.com/RJ-Bond/js-monitoring
cd js-monitoring

# 2. Configure
cp .env.example .env
nano .env   # set your passwords

# 3. Run
docker compose up -d --build

# Open http://localhost
```

## Installation on Ubuntu Server 24.04

```bash
curl -fsSL https://raw.githubusercontent.com/RJ-Bond/js-monitoring/main/install.sh | sudo bash
```

The script will:
- Install Docker + Docker Compose
- Clone the repository to `/opt/js-monitoring`
- Auto-generate secure passwords
- Configure UFW firewall (SSH + HTTP/HTTPS)
- Register a systemd service for auto-start on boot
- Build and launch all containers

## API Endpoints

| Method | Path                          | Description            |
|--------|-------------------------------|------------------------|
| GET    | `/api/v1/stats`               | Aggregated stats       |
| GET    | `/api/v1/servers`             | List all servers       |
| POST   | `/api/v1/servers`             | Add server             |
| GET    | `/api/v1/servers/:id`         | Server details         |
| PUT    | `/api/v1/servers/:id`         | Update server          |
| DELETE | `/api/v1/servers/:id`         | Delete server          |
| GET    | `/api/v1/servers/:id/history` | Player history         |
| WS     | `/api/v1/ws`                  | Real-time updates      |
| WS     | `/api/v1/rcon?key=<KEY>`      | RCON console (auth)    |

## Environment Variables

See [`.env.example`](.env.example) for full list.

Key variables:
- `DB_PASSWORD` — MySQL password
- `API_SECRET_KEY` — RCON authentication key
- `TELEGRAM_BOT_TOKEN` — Telegram bot token for alerts
- `NEXT_PUBLIC_API_URL` — Backend URL for frontend (empty = nginx proxy)

## Project Structure

```
js-monitoring/
├── backend/
│   ├── cmd/server/main.go          # Entrypoint
│   └── internal/
│       ├── models/                 # GORM models
│       ├── database/               # MySQL connection
│       ├── poller/                 # Smart Poller (A2S + Minecraft)
│       ├── api/                    # Echo handlers + WebSocket hub
│       └── telegram/               # Telegram Bot client
├── frontend/
│   └── src/
│       ├── app/                    # Next.js App Router
│       ├── components/             # ServerCard, PlayerChart, RconConsole…
│       ├── hooks/                  # useServers, useWebSocket
│       ├── lib/                    # api.ts, utils.ts
│       └── types/                  # TypeScript interfaces
├── nginx/nginx.conf                # Reverse proxy config
├── mysql/init.sql                  # DB initialization
├── docker-compose.yml              # All services
├── install.sh                      # Ubuntu 24.04 installer
└── .env.example                    # Configuration template
```

## License

MIT
