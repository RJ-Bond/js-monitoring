#!/usr/bin/env bash
# ============================================================================
#  JS Monitor — Installation Script for Ubuntu Server 24.04 LTS
#  Usage: curl -fsSL https://raw.githubusercontent.com/RJ-Bond/js-monitoring/main/install.sh | sudo bash
# ============================================================================
set -euo pipefail

REPO_URL="https://github.com/RJ-Bond/js-monitoring"
INSTALL_DIR="/opt/js-monitoring"
SERVICE_FILE="/etc/systemd/system/js-monitoring.service"
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
IS_UPDATE=false

info()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✘]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${GREEN}══ $* ══${NC}"; }

# ── Error trap ────────────────────────────────────────────────────────────────
on_error() {
    local line="${1:-?}"
    echo -e "\n${RED}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║         ✘  Installation failed (line ${line})        ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════╝${NC}"
    echo -e "  Check the output above for details."
    echo -e "  Logs: ${YELLOW}docker compose --project-directory ${INSTALL_DIR} logs${NC}"
}
trap 'on_error $LINENO' ERR

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Please run with sudo / Запустите с sudo: sudo bash install.sh"

# ── OS check ──────────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    if [[ "${ID:-}" != "ubuntu" ]]; then
        warn "Designed for Ubuntu 24.04. Detected: ${PRETTY_NAME:-unknown OS}. Proceeding anyway..."
    fi
fi

# ── Language selection / Выбор языка ──────────────────────────────────────────
AUTO_LANG=$(locale 2>/dev/null | grep -i "^LANG=" | cut -d= -f2 | cut -d_ -f1 | tr '[:upper:]' '[:lower:]' || echo "en")
[[ "$AUTO_LANG" == "ru" ]] && DEF=2 || DEF=1

echo -e "\n${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         JS Monitor — Installer v1.0          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}\n"
echo    "  Select language / Выберите язык:"
echo    "    1) English"
echo    "    2) Русский"
echo -n "  [1/2, default ${DEF}]: "
read -r LANG_CHOICE </dev/tty
LANG_CHOICE="${LANG_CHOICE:-$DEF}"
[[ "$LANG_CHOICE" == "2" ]] && UI_LANG="ru" || UI_LANG="en"

# ── Localized strings ─────────────────────────────────────────────────────────
if [[ "$UI_LANG" == "ru" ]]; then
    T_OS_WARN="Скрипт предназначен для Ubuntu 24.04"
    T_CLEANUP="Очистка устаревших APT-репозиториев"
    T_REMOVING_REPO="Удаление устаревшего MySQL APT репозитория"
    T_MYSQL_CLEANUP_OK="Очистка MySQL APT репозитория завершена."
    T_APT_INLINE="Комментирование MySQL-записи в /etc/apt/sources.list"
    T_SYSTEM_UPDATE="Обновление системы"
    T_DOCKER="Docker"
    T_DOCKER_FOUND="Docker уже установлен"
    T_DOCKER_INSTALL="Устанавливаю Docker…"
    T_DOCKER_INSTALLED="Docker установлен"
    T_COMPOSE_FOUND="Docker Compose уже доступен"
    T_COMPOSE_INSTALL="Устанавливаю плагин Docker Compose…"
    T_REPO="Репозиторий"
    T_REPO_EXISTS="Репозиторий уже существует — обновляю до последней версии…"
    T_REPO_CLONE="Клонирую репозиторий"
    T_UPDATE_REBUILD="Обнаружено обновление — пересобираю контейнеры…"
    T_CONFIG="Конфигурация"
    T_ENV_GENERATED="Создан .env со случайными паролями."
    T_ENV_APPURL="Введите домен или IP сервера (для Steam auth и ссылок)"
    T_ENV_APPURL_DEFAULT="Оставьте пустым для http://localhost"
    T_ENV_EDIT="Отредактируйте ${INSTALL_DIR}/.env — укажите:"
    T_ENV_TG_TOKEN="  - TELEGRAM_BOT_TOKEN (необязательно)"
    T_ENV_TG_CHAT="  - TELEGRAM_DEFAULT_CHAT_ID (необязательно)"
    T_ENV_CONTINUE="Нажмите ENTER для продолжения, или Ctrl-C для редактирования файла."
    T_ENV_EXISTS=".env уже существует — оставляю текущую конфигурацию."
    T_FIREWALL="Брандмауэр (UFW)"
    T_UFW_OK="UFW настроен: SSH + HTTP/HTTPS разрешены."
    T_SYSTEMD="Systemd-сервис"
    T_SYSTEMD_OK="Systemd-сервис установлен и включён в автозапуск."
    T_BUILD="Сборка и запуск сервисов"
    T_HEALTH="Проверка готовности"
    T_HEALTH_WAIT="  Ожидание запуска… %dс из %dс"
    T_HEALTH_STATUS="  Статус контейнеров:"
    T_HEALTH_TIMEOUT="Сервисы слишком долго запускаются. Проверьте логи:"
    T_HEALTH_OK="Сервисы работают!"
    T_DONE_TITLE=" Установка JS Monitor завершена! "
    T_DONE_DASH="Панель управления"
    T_DONE_DIR="Директория"
    T_DONE_CFG="Конфигурация"
    T_DONE_CMDS="Полезные команды:"
    T_CMD_STATUS="# статус сервиса"
    T_CMD_LOGS="# логи в реальном времени"
    T_CMD_RESTART="# перезапуск"
    T_CMD_JSMON="# меню управления JS Monitor"
else
    T_OS_WARN="Designed for Ubuntu 24.04"
    T_CLEANUP="Cleaning up stale APT repositories"
    T_REMOVING_REPO="Removing stale MySQL APT repo"
    T_MYSQL_CLEANUP_OK="MySQL APT repo cleanup done."
    T_APT_INLINE="Commenting out MySQL entry in /etc/apt/sources.list"
    T_SYSTEM_UPDATE="System Update"
    T_DOCKER="Docker"
    T_DOCKER_FOUND="Docker already installed"
    T_DOCKER_INSTALL="Installing Docker…"
    T_DOCKER_INSTALLED="Docker installed"
    T_COMPOSE_FOUND="Docker Compose already available"
    T_COMPOSE_INSTALL="Installing Docker Compose plugin…"
    T_REPO="Repository"
    T_REPO_EXISTS="Repository exists — pulling latest…"
    T_REPO_CLONE="Cloning repository"
    T_UPDATE_REBUILD="Update detected — rebuilding containers…"
    T_CONFIG="Configuration"
    T_ENV_GENERATED="Generated .env with random passwords."
    T_ENV_APPURL="Enter server domain or IP (used for Steam auth and links)"
    T_ENV_APPURL_DEFAULT="Leave empty for http://localhost"
    T_ENV_EDIT="Edit ${INSTALL_DIR}/.env to set:"
    T_ENV_TG_TOKEN="  - TELEGRAM_BOT_TOKEN (optional)"
    T_ENV_TG_CHAT="  - TELEGRAM_DEFAULT_CHAT_ID (optional)"
    T_ENV_CONTINUE="Press ENTER to continue, or Ctrl-C to abort and edit the file first."
    T_ENV_EXISTS=".env already exists — keeping existing configuration."
    T_FIREWALL="Firewall (UFW)"
    T_UFW_OK="UFW configured: SSH + HTTP/HTTPS allowed."
    T_SYSTEMD="Systemd Service"
    T_SYSTEMD_OK="Systemd service installed and enabled on boot."
    T_BUILD="Building & Starting Services"
    T_HEALTH="Health Check"
    T_HEALTH_WAIT="  Waiting for services… %ds of %ds"
    T_HEALTH_STATUS="  Container status:"
    T_HEALTH_TIMEOUT="Services took too long to start. Check logs:"
    T_HEALTH_OK="Services are healthy!"
    T_DONE_TITLE=" JS Monitor — Installation Done! "
    T_DONE_DASH="Dashboard"
    T_DONE_DIR="Directory"
    T_DONE_CFG="Config"
    T_DONE_CMDS="Useful commands:"
    T_CMD_STATUS="# service status"
    T_CMD_LOGS="# live logs"
    T_CMD_RESTART="# restart all"
    T_CMD_JSMON="# JS Monitor management menu"
fi

# ── Fix: remove stale MySQL APT repo ──────────────────────────────────────────
section "$T_CLEANUP"
MYSQL_SOURCES=( /etc/apt/sources.list.d/mysql*.list /etc/apt/sources.list.d/mysql*.sources )
for f in "${MYSQL_SOURCES[@]}"; do
    if [[ -f "$f" ]]; then
        warn "$T_REMOVING_REPO: $f"
        rm -f "$f"
    fi
done
if grep -q "repo.mysql.com" /etc/apt/sources.list 2>/dev/null; then
    warn "$T_APT_INLINE"
    sed -i '/repo\.mysql\.com/s/^/# /' /etc/apt/sources.list
fi
rm -f /etc/apt/trusted.gpg.d/mysql*.gpg /usr/share/keyrings/mysql*.gpg 2>/dev/null || true
info "$T_MYSQL_CLEANUP_OK"

# ── System Update ─────────────────────────────────────────────────────────────
section "$T_SYSTEM_UPDATE"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release ufw

# ── Docker ────────────────────────────────────────────────────────────────────
section "$T_DOCKER"
if command -v docker &>/dev/null; then
    info "$T_DOCKER_FOUND: $(docker --version)"
else
    info "$T_DOCKER_INSTALL"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    info "$T_DOCKER_INSTALLED: $(docker --version)"
fi

if docker compose version &>/dev/null 2>&1; then
    info "$T_COMPOSE_FOUND: $(docker compose version)"
else
    info "$T_COMPOSE_INSTALL"
    apt-get install -y -qq docker-compose-plugin
fi

# ── Clone / Update repo ───────────────────────────────────────────────────────
section "$T_REPO"
if [[ -d "$INSTALL_DIR/.git" ]]; then
    IS_UPDATE=true
    info "$T_REPO_EXISTS"
    git -C "$INSTALL_DIR" pull --ff-only
else
    info "$T_REPO_CLONE: $REPO_URL → $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── Environment file ──────────────────────────────────────────────────────────
section "$T_CONFIG"
if [[ ! -f .env ]]; then
    cp .env.example .env
    DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
    API_KEY=$(openssl rand -hex 32)
    JWT_SEC=$(openssl rand -hex 32)
    ROOT_PASS=$(openssl rand -hex 16)
    sed -i "s/supersecretpassword/${DB_PASS}/g"                  .env
    sed -i "s/change_me_to_a_random_64char_string/${API_KEY}/g"  .env
    sed -i "s/change_me_to_a_random_64char_jwt_secret/${JWT_SEC}/g" .env
    sed -i "s/rootpassword/${ROOT_PASS}/g"                       .env

    # Prompt for APP_URL (needed for Steam auth)
    echo
    warn "$T_ENV_APPURL"
    warn "$T_ENV_APPURL_DEFAULT"
    echo -n "  URL [http://localhost]: "
    read -r APP_URL_INPUT </dev/tty
    if [[ -n "$APP_URL_INPUT" ]]; then
        # Ensure no trailing slash
        APP_URL_INPUT="${APP_URL_INPUT%/}"
        # Add scheme if missing
        [[ "$APP_URL_INPUT" =~ ^https?:// ]] || APP_URL_INPUT="http://${APP_URL_INPUT}"
        sed -i "s|APP_URL=.*|APP_URL=${APP_URL_INPUT}|" .env
    fi

    info "$T_ENV_GENERATED"
    warn "$T_ENV_EDIT"
    warn "$T_ENV_TG_TOKEN"
    warn "$T_ENV_TG_CHAT"
    echo
    info "$T_ENV_CONTINUE"
    read -r </dev/tty
else
    info "$T_ENV_EXISTS"
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
section "$T_FIREWALL"
ufw allow ssh     >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw default deny incoming  >/dev/null 2>&1 || true
ufw default allow outgoing >/dev/null 2>&1 || true
ufw --force enable         >/dev/null 2>&1 || true
info "$T_UFW_OK"

# ── Install jsmon CLI ─────────────────────────────────────────────────────────
cp "${INSTALL_DIR}/jsmon.sh" /usr/local/bin/jsmon
chmod +x /usr/local/bin/jsmon
info "jsmon CLI installed → /usr/local/bin/jsmon"

# ── Systemd service ───────────────────────────────────────────────────────────
section "$T_SYSTEMD"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=JS Monitoring Dashboard
Documentation=https://github.com/RJ-Bond/js-monitoring
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d --build --remove-orphans
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose pull && /usr/bin/docker compose up -d --build --remove-orphans
TimeoutStartSec=600
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable js-monitoring
info "$T_SYSTEMD_OK"

# ── Build & Start ─────────────────────────────────────────────────────────────
section "$T_BUILD"
if $IS_UPDATE; then
    info "$T_UPDATE_REBUILD"
fi
docker compose pull --quiet 2>/dev/null || true
docker compose up -d --build --remove-orphans

# ── Wait for MySQL to be healthy ──────────────────────────────────────────────
section "$T_HEALTH"
MAX_WAIT=600
WAITED=0
echo "  Waiting for MySQL database to initialize (this may take a minute)..."
while (( WAITED < 180 )); do
    MYSQL_STATUS=$(docker compose ps mysql 2>/dev/null | grep -oP '(?<=\(|\s)\(healthy\)|unhealthy|starting' | head -1 || echo "unknown")
    if [[ "$MYSQL_STATUS" == "healthy" ]]; then
        info "MySQL is healthy"
        break
    fi
    printf "  Waiting for MySQL... [%ds/%ds]\r" "$WAITED" "180"
    sleep 5
    WAITED=$((WAITED+5))
done

if [[ "$MYSQL_STATUS" != "healthy" ]]; then
    warn "MySQL failed to become healthy. Checking logs..."
    docker compose logs mysql 2>/dev/null | tail -20
fi

# ── Wait for application to be ready ──────────────────────────────────────────
WAITED=0
while ! curl -sf http://localhost/api/v1/stats >/dev/null 2>&1; do
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        warn "$T_HEALTH_TIMEOUT"
        warn "  docker compose --project-directory ${INSTALL_DIR} logs"
        docker compose ps 2>/dev/null || true
        break
    fi
    printf "  ${T_HEALTH_WAIT}\r" "$WAITED" "$MAX_WAIT"
    # Every 30 seconds print container statuses on a new line
    if (( WAITED > 0 && WAITED % 30 == 0 )); then
        echo
        echo -e "$T_HEALTH_STATUS"
        docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || true
        echo
    fi
    sleep 5
    WAITED=$((WAITED+5))
done
if curl -sf http://localhost/api/v1/stats >/dev/null 2>&1; then
    echo
    info "$T_HEALTH_OK"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
# Clear error trap before menu — menu commands may exit non-zero intentionally
trap - ERR

SERVER_IP=$(curl -sf https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')

echo
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ${T_DONE_TITLE}   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo
echo -e "  🌐 ${T_DONE_DASH}:  ${GREEN}http://${SERVER_IP}${NC}"
echo -e "  📁 ${T_DONE_DIR}:   ${INSTALL_DIR}"
echo -e "  🔧 ${T_DONE_CFG}:     ${INSTALL_DIR}/.env"
echo
echo -e "  ${T_DONE_CMDS}"
echo -e "    ${YELLOW}jsmon${NC}                                                    ${T_CMD_JSMON}"
echo -e "    ${YELLOW}systemctl status js-monitoring${NC}                          ${T_CMD_STATUS}"
echo -e "    ${YELLOW}docker compose --project-directory ${INSTALL_DIR} logs -f${NC}  ${T_CMD_LOGS}"
echo -e "    ${YELLOW}systemctl restart js-monitoring${NC}                         ${T_CMD_RESTART}"
echo

# ── Post-install management menu ──────────────────────────────────────────────
# jsmon CLI was installed to /usr/local/bin/jsmon — use it directly
if command -v jsmon &>/dev/null; then
    jsmon
fi
