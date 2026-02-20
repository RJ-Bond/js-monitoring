# JSMonitor — Панель мониторинга игровых серверов

> **v1.0.0** · Go + Next.js 14 + MySQL · Docker Compose · Glassmorphism UI

Высокопроизводительная реактивная панель мониторинга игровых серверов с real-time обновлениями, системой аккаунтов, новостями, публичными профилями и панелью администратора.

---

## Скриншоты

| Главная страница | Профиль | Панель администратора |
|---|---|---|
| Серверы в реальном времени | Аватар, статистика, API-токен | Управление пользователями и серверами |

---

## Возможности

### Мониторинг серверов
- **Real-time WebSocket** — мгновенное обновление статуса без перезагрузки, экспоненциальный реконнект
- **Поддерживаемые игры**: Source Engine, Garry's Mod, Valheim, Squad, DayZ, V Rising, Icarus, Minecraft Java/Bedrock, FiveM / GTA V, SA-MP / open.mp, Terraria
- **История онлайна** — графики за 24ч / 7д / 30д
- **Список игроков** — A2S, SA-MP и Minecraft query в реальном времени
- **Автоопределение** — название сервера и флаг страны (GeoIP) при добавлении
- **Display IP** — показывать на карточке домен вместо реального IP
- **Кнопка «Играть»** — deeplink к клиенту (`steam://`, `fivem://`, `samp://`, `minecraft://`)
- **Копирование IP** и шеринг ссылки на сервер

### Интерфейс
- **Поиск, фильтры, сортировка** — по игре, статусу, игрокам, пингу, названию
- **Избранное** — закрепление серверов вверху списка
- **Занятость сервера** — цветовой индикатор заполненности (зелёный / жёлтый / красный)
- **Мобильное меню** — адаптивный дизайн для любых экранов
- **Мультиязычность** — интерфейс на русском и английском (переключение без перезагрузки)
- **Glassmorphism UI** — тёмная тема с neon-акцентами и эффектами свечения

### Аккаунты и профили
- Регистрация по логину/паролю, вход через **Steam OpenID**
- **Профиль пользователя** (`/profile`): аватар (WebP 256×256), имя, email, пароль, Steam ID, API-токен, удаление аккаунта
- **Публичная страница** (`/u/:username`) — серверы пользователя, роль, дата регистрации
- JWT авторизация (7 дней) с опцией «Запомнить меня»
- Владение серверами — редактировать/удалять можно только свои

### Новости / объявления
- Markdown-редактор с режимом предпросмотра
- Аватар автора, время чтения, метка «изменено»
- Закреплённый featured-пост + компактный список
- CRUD управление через панель администратора

### Панель администратора (`/admin`)
- **Пользователи** — поиск, фильтры, бан, смена роли, удаление
- **Серверы** — просмотр и удаление всех серверов
- **Статистика** — сводные карточки по пользователям и серверам
- **Настройки сайта** — изменить название и логотип (применяется ко всем страницам без перезапуска)
- **Управление новостями** (`/admin/news`) — добавление, редактирование, удаление постов

### Первый запуск
- Страница `/setup` — создание первого администратора при пустой БД

### Инфраструктура
- **Docker Compose** — MySQL 8.4, Go-бэкенд, Next.js frontend, Nginx reverse-proxy
- **Скрипт установки** (`install.sh`) для Ubuntu Server 24.04 (RU/EN, systemd)
- **502-страница** — кастомная страница с обратным отсчётом и EN/RU переключением
- **RCON Web-консоль** — защищённый терминал прямо в браузере

---

## Технологический стек

| Слой | Технология |
|------|------------|
| Бэкенд | Go 1.24, Echo v4, GORM v2 |
| База данных | MySQL 8.4 LTS |
| Фронтенд | Next.js 14, TypeScript, Tailwind CSS |
| Состояние | React Query (TanStack Query) |
| Real-time | WebSocket (gorilla/websocket) |
| Графики | Recharts |
| Иконки | lucide-react |
| Инфраструктура | Docker Compose, Nginx, systemd |

---

## Быстрый старт (Docker)

```bash
# 1. Клонировать репозиторий
git clone https://github.com/RJ-Bond/js-monitoring
cd js-monitoring

# 2. Настроить конфигурацию
cp .env.example .env
nano .env   # задать JWT_SECRET, DB_PASSWORD и пр.

# 3. Запустить
docker compose up -d --build

# 4. Открыть в браузере → откроется /setup для создания администратора
# http://localhost
```

---

## Установка на Ubuntu Server 24.04

```bash
curl -fsSL https://raw.githubusercontent.com/RJ-Bond/js-monitoring/main/install.sh | sudo bash
```

Скрипт автоматически:
- Устанавливает Docker + Docker Compose
- Клонирует репозиторий в `/opt/js-monitoring`
- Генерирует случайные безопасные пароли
- Настраивает UFW (SSH + HTTP/HTTPS)
- Регистрирует systemd-сервис для автозапуска
- Собирает и запускает все контейнеры

---

## Переменные окружения

Полный список — [`.env.example`](.env.example)

| Переменная | Описание |
|------------|----------|
| `DB_PASSWORD` | Пароль MySQL |
| `JWT_SECRET` | Секрет для подписи JWT-токенов (случайная строка 64 символа) |
| `API_SECRET_KEY` | Ключ авторизации RCON WebSocket |
| `STEAM_API_KEY` | API-ключ Steam для входа через Steam ([получить](https://steamcommunity.com/dev/apikey)) |
| `APP_URL` | Публичный URL приложения (для Steam OpenID callback) |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота для уведомлений (опционально) |
| `TELEGRAM_DEFAULT_CHAT_ID` | Chat ID для уведомлений по умолчанию (опционально) |

---

## API

### Публичные маршруты

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/stats` | Сводная статистика |
| GET | `/api/v1/servers` | Список всех серверов со статусами |
| GET | `/api/v1/servers/:id` | Данные одного сервера |
| GET | `/api/v1/servers/:id/history?period=24h` | История онлайна (24h / 7d / 30d) |
| GET | `/api/v1/servers/:id/players` | Список игроков онлайн |
| GET | `/api/v1/news` | Список новостей |
| GET | `/api/v1/settings` | Настройки сайта (название, логотип) |
| GET | `/api/v1/users/:username` | Публичный профиль пользователя |
| WS | `/api/v1/ws` | Real-time обновления статусов |
| WS | `/api/v1/rcon` | RCON Web-консоль |

### Авторизованные маршруты (JWT)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/v1/auth/register` | Регистрация |
| POST | `/api/v1/auth/login` | Вход (возвращает JWT) |
| GET | `/api/v1/auth/steam` | Вход через Steam |
| POST | `/api/v1/servers` | Добавить сервер |
| PUT | `/api/v1/servers/:id` | Обновить сервер (только владелец / admin) |
| DELETE | `/api/v1/servers/:id` | Удалить сервер (только владелец / admin) |
| GET | `/api/v1/profile` | Профиль текущего пользователя |
| PUT | `/api/v1/profile` | Обновить имя / email / пароль |
| PUT | `/api/v1/profile/avatar` | Загрузить аватар (base64 WebP) |
| POST | `/api/v1/profile/token` | Сгенерировать / обновить API-токен |
| GET | `/api/v1/profile/servers` | Мои серверы |
| DELETE | `/api/v1/profile` | Удалить аккаунт |

### Маршруты администратора (JWT + роль admin)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/v1/admin/users` | Список всех пользователей |
| PUT | `/api/v1/admin/users/:id` | Обновить роль / бан пользователя |
| DELETE | `/api/v1/admin/users/:id` | Удалить пользователя |
| GET | `/api/v1/admin/servers` | Список всех серверов с владельцами |
| POST | `/api/v1/admin/news` | Создать новость |
| PUT | `/api/v1/admin/news/:id` | Обновить новость |
| DELETE | `/api/v1/admin/news/:id` | Удалить новость |
| PUT | `/api/v1/admin/settings` | Обновить настройки сайта |

---

## Структура проекта

```
js-monitoring/
├── backend/
│   ├── cmd/server/main.go          # Точка входа, роутинг Echo
│   └── internal/
│       ├── models/                 # GORM-модели (User, Server, NewsItem, SiteSettings…)
│       ├── database/               # Подключение к MySQL, AutoMigrate
│       ├── poller/                 # Опросчик: A2S, SAMP, Minecraft, FiveM
│       ├── api/                    # Echo-хэндлеры + WebSocket хаб
│       └── telegram/               # Telegram Bot уведомления
├── frontend/
│   └── src/
│       ├── app/                    # Next.js App Router (страницы)
│       │   ├── page.tsx            # Главная с серверами и новостями
│       │   ├── admin/              # Панель администратора
│       │   ├── profile/            # Личный кабинет
│       │   ├── u/[username]/       # Публичный профиль
│       │   ├── login/ register/    # Авторизация
│       │   └── setup/              # Первоначальная настройка
│       ├── components/             # ServerCard, SiteBrand, GameIcon, Toast…
│       ├── contexts/               # AuthContext, LanguageContext, SiteSettingsContext
│       ├── hooks/                  # useServers, useWebSocket, useFavorites…
│       ├── lib/                    # api.ts, utils.ts, translations.ts
│       └── types/                  # TypeScript-интерфейсы
├── nginx/
│   ├── nginx.conf                  # Reverse proxy + WebSocket проксирование
│   └── 502.html                    # Кастомная страница обслуживания
├── mysql/init.sql                  # Инициализация БД
├── docker-compose.yml              # Все сервисы
├── install.sh                      # Установщик для Ubuntu 24.04 (RU/EN)
└── .env.example                    # Шаблон конфигурации
```

---

## Управление после установки

```bash
# Статус сервиса
systemctl status js-monitoring

# Логи в реальном времени
docker compose -f /opt/js-monitoring/docker-compose.yml logs -f

# Перезапуск
systemctl restart js-monitoring

# Обновление до последней версии
cd /opt/js-monitoring && git pull && docker compose up -d --build
```

---

## Лицензия

MIT — свободное использование, модификация и распространение.
