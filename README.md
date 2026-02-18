# JS Monitor — Панель мониторинга игровых серверов

Высокопроизводительная реактивная панель управления игровыми серверами: Go-бэкенд + Next.js 15 + MySQL 8.4, всё в Docker.

## Возможности

- **Smart Poller** — адаптивный опрос: 10 сек (активная игра) / 60 сек (пустой сервер)
- **Real-time WebSockets** — мгновенное обновление статуса без перезагрузки страницы
- **Source A2S + Minecraft Query** — поддержка CS2, TF2, Rust, Minecraft, FiveM
- **RCON Web-консоль** — защищённый терминал прямо в браузере
- **Auto-Join** — кнопка «Играть» генерирует `steam://`, `minecraft://`, `fivem://`
- **Аналитика** — графики онлайна за 24ч / 7д / 30д (Recharts)
- **Telegram-уведомления** — мгновенные алерты о падении серверов
- **Glassmorphism UI** — Cyberpunk Minimal дизайн с neon-эффектами
- **Мультиязычность** — интерфейс на русском и английском языках

## Технологический стек

| Слой       | Технология                          |
|------------|-------------------------------------|
| Бэкенд     | Go 1.24, Echo v4, GORM              |
| База данных | MySQL 8.4 LTS                      |
| Фронтенд   | Next.js 15, Tailwind CSS            |
| Графики    | Recharts                            |
| Real-time  | WebSocket (gorilla/websocket)       |
| Инфраструктура | Docker, Nginx, systemd          |

## Быстрый старт (Docker)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/RJ-Bond/js-monitoring
cd js-monitoring

# 2. Настроить конфигурацию
cp .env.example .env
nano .env   # задать пароли и токены

# 3. Запустить
docker compose up -d --build

# Открыть http://localhost
```

## Установка на Ubuntu Server 24.04

```bash
curl -fsSL https://raw.githubusercontent.com/RJ-Bond/js-monitoring/main/install.sh | sudo bash
```

Скрипт поддерживает **русский и английский язык** — выбор предлагается при запуске.

Скрипт автоматически:
- Удаляет устаревшие MySQL APT-репозитории (если есть)
- Устанавливает Docker + Docker Compose
- Клонирует репозиторий в `/opt/js-monitoring`
- Генерирует случайные безопасные пароли
- Настраивает UFW (SSH + HTTP/HTTPS)
- Регистрирует systemd-сервис для автозапуска
- Собирает и запускает все контейнеры

## API

| Метод  | Путь                            | Описание                 |
|--------|---------------------------------|--------------------------|
| GET    | `/api/v1/stats`                 | Сводная статистика       |
| GET    | `/api/v1/servers`               | Список всех серверов     |
| POST   | `/api/v1/servers`               | Добавить сервер          |
| GET    | `/api/v1/servers/:id`           | Данные сервера           |
| PUT    | `/api/v1/servers/:id`           | Обновить сервер          |
| DELETE | `/api/v1/servers/:id`           | Удалить сервер           |
| GET    | `/api/v1/servers/:id/history`   | История онлайна          |
| WS     | `/api/v1/ws`                    | Real-time обновления     |
| WS     | `/api/v1/rcon?key=<KEY>`        | RCON-консоль (с авторизацией) |

## Переменные окружения

Полный список: [`.env.example`](.env.example)

Основные:
- `DB_PASSWORD` — пароль MySQL
- `API_SECRET_KEY` — ключ аутентификации RCON
- `TELEGRAM_BOT_TOKEN` — токен Telegram-бота для уведомлений
- `NEXT_PUBLIC_API_URL` — URL бэкенда (пусто = nginx-прокси)

## Структура проекта

```
js-monitoring/
├── backend/
│   ├── cmd/server/main.go          # Точка входа
│   └── internal/
│       ├── models/                 # GORM-модели
│       ├── database/               # Подключение к MySQL
│       ├── poller/                 # Smart Poller (A2S + Minecraft)
│       ├── api/                    # Echo хэндлеры + WebSocket хаб
│       └── telegram/               # Клиент Telegram Bot API
├── frontend/
│   └── src/
│       ├── app/                    # Next.js App Router
│       ├── components/             # ServerCard, PlayerChart, RconConsole…
│       ├── contexts/               # LanguageContext (i18n)
│       ├── hooks/                  # useServers, useWebSocket, useLanguage
│       ├── lib/                    # api.ts, utils.ts, translations.ts
│       └── types/                  # TypeScript-интерфейсы
├── nginx/nginx.conf                # Reverse proxy
├── mysql/init.sql                  # Инициализация БД
├── docker-compose.yml              # Все сервисы
├── install.sh                      # Установщик для Ubuntu 24.04 (RU/EN)
└── .env.example                    # Шаблон конфигурации
```

## Управление (после установки)

```bash
# Статус
systemctl status js-monitoring

# Логи в реальном времени
docker compose -C /opt/js-monitoring logs -f

# Перезапуск
systemctl restart js-monitoring

# Обновление до последней версии
cd /opt/js-monitoring && git pull && docker compose up -d --build
```

## Лицензия

MIT
