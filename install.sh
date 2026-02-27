#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#   JS Monitor — Installer  •  Ubuntu 24.04 LTS
#   curl -fsSL https://raw.githubusercontent.com/RJ-Bond/
#              js-monitoring/main/install.sh | sudo bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

REPO_URL="https://github.com/RJ-Bond/js-monitoring"
INSTALL_DIR="/opt/js-monitoring"
SERVICE_FILE="/etc/systemd/system/js-monitoring.service"
IS_UPDATE=false
SSL_MODE_VAL="none"

# ── Colors & Helpers ──────────────────────────────────────────────────
G="\033[0;32m"; Y="\033[1;33m"; R="\033[0;31m"; C="\033[0;36m"
M="\033[0;35m"; W="\033[1;37m"; DIM="\033[2m"; NC="\033[0m"; BD="\033[1m"

STEP_N=0; TOTAL_STEPS=9

ok()    { echo -e "  ${G}✔${NC}  $*"; }
warn()  { echo -e "  ${Y}⚠${NC}  $*"; }
info()  { echo -e "  ${DIM}→${NC}  $*"; }
err()   { echo -e "\n  ${R}✖  $*${NC}" >&2; exit 1; }
ask()   { echo -en "  ${Y}?${NC}  ${W}$*${NC} "; }
hr()    { echo -e "${DIM}  ─────────────────────────────────────────────────${NC}"; }

step() {
  STEP_N=$((STEP_N + 1))
  echo -e "\n${C}${BD}┌─────────────────────────────────────────────────┐${NC}"
  printf   "${C}${BD}│  %-3s  %-41s  │${NC}\n" "[${STEP_N}/${TOTAL_STEPS}]" "$*"
  echo -e  "${C}${BD}└─────────────────────────────────────────────────┘${NC}"
}

on_error() {
  echo -e "\n${R}${BD}  ┌──────────────────────────────────────────────┐"
  echo -e          "  │  ✖  Installation failed at line ${1:-?}             │"
  echo -e          "  └──────────────────────────────────────────────┘${NC}"
  echo -e "  ${DIM}Check the output above for details.${NC}"
  echo -e "  ${DIM}Logs: docker compose --project-directory ${INSTALL_DIR} logs${NC}"
}
trap 'on_error $LINENO' ERR

# ── Root check ────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run with sudo / Запустите с sudo: sudo bash install.sh"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BANNER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo
echo -e "${G}${BD}  ╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${G}${BD}  ║                                                   ║${NC}"
echo -e "${G}${BD}  ║   🖥️   JS Monitor  ·  Installer  v2.0            ║${NC}"
echo -e "${G}${BD}  ║        Ubuntu 24.04 LTS  ·  Docker  ·  Nginx     ║${NC}"
echo -e "${G}${BD}  ║                                                   ║${NC}"
echo -e "${G}${BD}  ╚═══════════════════════════════════════════════════╝${NC}"
echo

# ── Language / Язык ──────────────────────────────────────────────────
AUTO_LANG=$(locale 2>/dev/null | grep -i "^LANG=" | cut -d= -f2 | cut -d_ -f1 | tr '[:upper:]' '[:lower:]' || echo "en")
[[ "$AUTO_LANG" == "ru" ]] && DEF=2 || DEF=1

hr
echo -e "  ${W}🌐  Select language / Выберите язык${NC}"
echo -e "      ${G}1)${NC} English    ${G}2)${NC} Русский"
hr
ask "[1/2, default ${DEF}]:"
read -r LANG_CHOICE </dev/tty
LANG_CHOICE="${LANG_CHOICE:-$DEF}"
[[ "$LANG_CHOICE" == "2" ]] && L="ru" || L="en"

# ── Localized strings ─────────────────────────────────────────────────
if [[ "$L" == "ru" ]]; then
  T_PREP="🔧  Подготовка системы"
  T_DOCKER="🐳  Docker"
  T_DOCKER_OK="Docker уже установлен"
  T_DOCKER_INST="Устанавливаю Docker…"
  T_COMPOSE_OK="Docker Compose"
  T_REPO="📦  Репозиторий"
  T_REPO_UPDATE="Обновляю до последней версии…"
  T_REPO_CLONE="Клонирую репозиторий"
  T_CONFIG="⚙️   Конфигурация"
  T_URL_PROMPT="Домен или IP сервера"
  T_URL_HINT="Используется для Steam auth и ссылок (пусто = http://localhost)"
  T_ENV_OK="Файл .env создан с безопасными случайными паролями"
  T_ENV_EXISTS=".env уже существует — конфигурация сохранена"
  T_ENV_HINT="Дополнительные настройки в ${INSTALL_DIR}/.env:"
  T_ENV_TG="  Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_DEFAULT_CHAT_ID"
  T_ENV_CONT="Нажмите Enter для продолжения…"
  T_SSL="🔒  SSL / HTTPS"
  T_SSL_PROMPT="Выберите режим SSL"
  T_SSL_1="  1)  🔓  HTTP           — без SSL (по умолчанию)"
  T_SSL_2="  2)  🔒  Let's Encrypt  — бесплатный автоматический SSL"
  T_SSL_3="  3)  🔐  Custom         — свой сертификат"
  T_SSL_DOMAIN="Домен (например: monitor.example.com)"
  T_SSL_EMAIL="Email для Let's Encrypt уведомлений"
  T_SSL_CERT="Получаю сертификат от Let's Encrypt…"
  T_SSL_CERT_OK="🔒  SSL-сертификат получен"
  T_SSL_CRT="Путь к файлу сертификата (fullchain.pem)"
  T_SSL_KEY="Путь к файлу ключа (privkey.pem)"
  T_FW="🛡️   Брандмауэр (UFW)"
  T_FW_OK="UFW настроен: SSH, HTTP (80), HTTPS (443)"
  T_SVC="⚡  Systemd-сервис"
  T_SVC_OK="Сервис js-monitoring включён в автозапуск"
  T_SWAP="Swap-файл 2 ГБ создан (защита от OOM при сборке)"
  T_SWAP_EXISTS="Swap уже настроен"
  T_BUILD="🚀  Сборка и запуск контейнеров"
  T_BUILD_PREP="Подготовка MySQL 8.0…"
  T_BUILD_PULL="Загружаю образы Docker…"
  T_BUILD_UP="Запускаю контейнеры…"
  T_MYSQL_OK="MySQL 8.0 запущен и готов"
  T_MYSQL_WAIT="🗄️   Ожидание MySQL"
  T_HEALTH="💓  Проверка готовности"
  T_HEALTH_API="🌐  Проверка API…"
  T_HEALTH_WAIT="  ⏳  %dс / %dс"
  T_HEALTH_OK="Все сервисы работают!"
  T_HEALTH_TIMEOUT="Сервисы долго запускаются — проверьте логи"
  T_DONE_TITLE="  ✅  Установка JS Monitor завершена!  "
  T_INFO_DASH="🌐  Панель управления"
  T_INFO_DIR="📁  Директория"
  T_INFO_CFG="🔧  Конфигурация"
  T_CMDS="📋  Полезные команды"
  T_C1="меню управления"
  T_C2="статус сервиса"
  T_C3="логи в реальном времени"
  T_C4="перезапуск"
else
  T_PREP="🔧  System Preparation"
  T_DOCKER="🐳  Docker"
  T_DOCKER_OK="Docker already installed"
  T_DOCKER_INST="Installing Docker…"
  T_COMPOSE_OK="Docker Compose"
  T_REPO="📦  Repository"
  T_REPO_UPDATE="Pulling latest changes…"
  T_REPO_CLONE="Cloning repository"
  T_CONFIG="⚙️   Configuration"
  T_URL_PROMPT="Server domain or IP"
  T_URL_HINT="Used for Steam auth & links (empty = http://localhost)"
  T_ENV_OK="Created .env with secure random passwords"
  T_ENV_EXISTS=".env already exists — keeping current config"
  T_ENV_HINT="Optional settings in ${INSTALL_DIR}/.env:"
  T_ENV_TG="  Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_DEFAULT_CHAT_ID"
  T_ENV_CONT="Press Enter to continue…"
  T_SSL="🔒  SSL / HTTPS"
  T_SSL_PROMPT="Select SSL mode"
  T_SSL_1="  1)  🔓  HTTP           — no SSL (default)"
  T_SSL_2="  2)  🔒  Let's Encrypt  — free automatic SSL"
  T_SSL_3="  3)  🔐  Custom         — your own certificate"
  T_SSL_DOMAIN="Domain (e.g. monitor.example.com)"
  T_SSL_EMAIL="Email for Let's Encrypt notifications"
  T_SSL_CERT="Obtaining certificate from Let's Encrypt…"
  T_SSL_CERT_OK="🔒  SSL certificate obtained"
  T_SSL_CRT="Path to certificate file (fullchain.pem)"
  T_SSL_KEY="Path to private key file (privkey.pem)"
  T_FW="🛡️   Firewall (UFW)"
  T_FW_OK="UFW configured: SSH, HTTP (80), HTTPS (443)"
  T_SVC="⚡  Systemd Service"
  T_SVC_OK="js-monitoring service enabled on boot"
  T_SWAP="2 GB swap file created (OOM protection during build)"
  T_SWAP_EXISTS="Swap already configured"
  T_BUILD="🚀  Build & Start Containers"
  T_BUILD_PREP="Preparing MySQL 8.0…"
  T_BUILD_PULL="Pulling Docker images…"
  T_BUILD_UP="Starting containers…"
  T_MYSQL_OK="MySQL 8.0 is up and ready"
  T_MYSQL_WAIT="🗄️   Waiting for MySQL"
  T_HEALTH="💓  Health Check"
  T_HEALTH_API="🌐  Checking API…"
  T_HEALTH_WAIT="  ⏳  %ds / %ds"
  T_HEALTH_OK="All services are healthy!"
  T_HEALTH_TIMEOUT="Services are slow to start — check logs"
  T_DONE_TITLE="  ✅  JS Monitor installation complete!  "
  T_INFO_DASH="🌐  Dashboard"
  T_INFO_DIR="📁  Directory"
  T_INFO_CFG="🔧  Config file"
  T_CMDS="📋  Useful commands"
  T_C1="management menu"
  T_C2="service status"
  T_C3="live logs"
  T_C4="restart"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 1 — System Preparation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_PREP"

# Remove stale MySQL APT repos (legacy cleanup)
for f in /etc/apt/sources.list.d/mysql*.list /etc/apt/sources.list.d/mysql*.sources; do
  [[ -f "$f" ]] && rm -f "$f" && info "Removed stale APT repo: $f"
done
grep -q "repo.mysql.com" /etc/apt/sources.list 2>/dev/null \
  && sed -i '/repo\.mysql\.com/s/^/# /' /etc/apt/sources.list
rm -f /etc/apt/trusted.gpg.d/mysql*.gpg /usr/share/keyrings/mysql*.gpg 2>/dev/null || true

info "apt-get update & upgrade…"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release ufw openssl

# ── Swap (prevents OOM during Next.js build on 1 GB VDS) ─────────────
TOTAL_SWAP=$(swapon --show=SIZE --noheadings --bytes 2>/dev/null | awk '{sum+=$1} END{print sum+0}')
if (( TOTAL_SWAP < 1073741824 )); then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile 2>/dev/null \
      || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile -q
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "$T_SWAP"
else
  ok "$T_SWAP_EXISTS  ($(( TOTAL_SWAP / 1024 / 1024 )) MB)"
fi

ok "$T_PREP"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 2 — Docker
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_DOCKER"
if command -v docker &>/dev/null; then
  ok "$T_DOCKER_OK  $(docker --version | grep -oP '\d+\.\d+\.\d+')"
else
  info "$T_DOCKER_INST"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+') installed"
fi
if ! docker compose version &>/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-plugin
fi
ok "$T_COMPOSE_OK  $(docker compose version --short 2>/dev/null || echo 'ok')"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 3 — Repository
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_REPO"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  IS_UPDATE=true
  info "$T_REPO_UPDATE"
  git -C "$INSTALL_DIR" pull --ff-only
  ok "$T_REPO_UPDATE"
else
  info "$T_REPO_CLONE → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  ok "$T_REPO_CLONE"
fi
cd "$INSTALL_DIR"
echo "$L" > "${INSTALL_DIR}/.jsmon-lang"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 4 — Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_CONFIG"

if [[ ! -f .env ]]; then
  cp .env.example .env
  DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  API_KEY=$(openssl rand -hex 32)
  JWT_SEC=$(openssl rand -hex 32)
  ROOT_PASS=$(openssl rand -hex 16)
  sed -i "s/supersecretpassword/${DB_PASS}/g"                     .env
  sed -i "s/change_me_to_a_random_64char_string/${API_KEY}/g"     .env
  sed -i "s/change_me_to_a_random_64char_jwt_secret/${JWT_SEC}/g" .env
  sed -i "s/rootpassword/${ROOT_PASS}/g"                          .env

  echo
  echo -e "  ${W}$T_URL_PROMPT${NC}"
  echo -e "  ${DIM}$T_URL_HINT${NC}"
  ask "[http://localhost]:"
  read -r APP_URL_INPUT </dev/tty
  if [[ -n "$APP_URL_INPUT" ]]; then
    APP_URL_INPUT="${APP_URL_INPUT%/}"
    [[ "$APP_URL_INPUT" =~ ^https?:// ]] || APP_URL_INPUT="http://${APP_URL_INPUT}"
    sed -i "s|APP_URL=.*|APP_URL=${APP_URL_INPUT}|" .env
  fi

  # ── SSL selection ─────────────────────────────────────────────────
  echo
  echo -e "  ${W}$T_SSL_PROMPT:${NC}"
  echo -e "$T_SSL_1"
  echo -e "$T_SSL_2"
  echo -e "$T_SSL_3"
  ask "[1/2/3, default 1]:"
  read -r SSL_CHOICE </dev/tty
  SSL_CHOICE="${SSL_CHOICE:-1}"

  case "$SSL_CHOICE" in
  2)
    SSL_MODE_VAL="letsencrypt"
    echo
    ask "$T_SSL_DOMAIN:";  read -r SSL_DOMAIN_VAL </dev/tty
    ask "$T_SSL_EMAIL:";   read -r SSL_EMAIL       </dev/tty
    [[ -n "$SSL_DOMAIN_VAL" ]] && {
      sed -i "s|APP_URL=.*|APP_URL=https://${SSL_DOMAIN_VAL}|" .env
      sed -i "s|SSL_DOMAIN=.*|SSL_DOMAIN=${SSL_DOMAIN_VAL}|"   .env
    }
    sed -i "s|SSL_MODE=.*|SSL_MODE=letsencrypt|" .env
    info "$T_SSL_CERT"
    apt-get install -y -qq certbot
    mkdir -p /var/www/certbot
    certbot certonly --standalone --non-interactive --agree-tos \
      --email "$SSL_EMAIL" -d "$SSL_DOMAIN_VAL" --preferred-challenges http
    sed "s|{DOMAIN}|${SSL_DOMAIN_VAL}|g" nginx/nginx-ssl.conf > nginx/nginx.conf
    ok "$T_SSL_CERT_OK  ${SSL_DOMAIN_VAL}"
    ;;
  3)
    SSL_MODE_VAL="custom"
    echo
    ask "$T_SSL_CRT:"; read -r CUSTOM_CRT </dev/tty
    ask "$T_SSL_KEY:"; read -r CUSTOM_KEY </dev/tty
    mkdir -p nginx/ssl
    cp "$CUSTOM_CRT" nginx/ssl/fullchain.pem
    cp "$CUSTOM_KEY" nginx/ssl/privkey.pem
    SSL_DOMAIN_VAL=$(openssl x509 -noout -subject -in nginx/ssl/fullchain.pem 2>/dev/null \
      | grep -oP 'CN\s*=\s*\K[^,/]+' | head -1 || echo "")
    cp nginx/nginx-ssl-custom.conf nginx/nginx.conf
    sed -i "s|SSL_MODE=.*|SSL_MODE=custom|" .env
    [[ -n "$SSL_DOMAIN_VAL" ]] && {
      sed -i "s|SSL_DOMAIN=.*|SSL_DOMAIN=${SSL_DOMAIN_VAL}|" .env
      sed -i "s|APP_URL=.*|APP_URL=https://${SSL_DOMAIN_VAL}|" .env
    }
    ok "$T_SSL_CERT_OK${SSL_DOMAIN_VAL:+  ${SSL_DOMAIN_VAL}}"
    ;;
  *)
    SSL_MODE_VAL="none"
    ;;
  esac

  echo
  ok "$T_ENV_OK"
  hr
  warn "$T_ENV_HINT"
  warn "$T_ENV_TG"
  hr
  ask "$T_ENV_CONT"; read -r </dev/tty
else
  ok "$T_ENV_EXISTS"
  SSL_MODE_VAL=$(grep "^SSL_MODE=" .env 2>/dev/null | cut -d= -f2 || echo "none")
  # On update: regenerate nginx.conf from the correct template so git pull
  # doesn't leave a stale HTTP-only config when SSL is configured.
  SSL_DOMAIN_VAL=$(grep "^SSL_DOMAIN=" .env 2>/dev/null | cut -d= -f2 || echo "")
  case "$SSL_MODE_VAL" in
    letsencrypt) [[ -n "$SSL_DOMAIN_VAL" ]] && sed "s|{DOMAIN}|${SSL_DOMAIN_VAL}|g" nginx/nginx-ssl.conf > nginx/nginx.conf ;;
    custom)      cp nginx/nginx-ssl-custom.conf nginx/nginx.conf ;;
  esac
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 5 — Firewall
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_FW"
ufw allow ssh     >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw default deny incoming  >/dev/null 2>&1 || true
ufw default allow outgoing >/dev/null 2>&1 || true
ufw --force enable         >/dev/null 2>&1 || true
ok "$T_FW_OK"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 6 — jsmon CLI
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cp "${INSTALL_DIR}/jsmon.sh" /usr/local/bin/jsmon && chmod +x /usr/local/bin/jsmon
ok "jsmon CLI → /usr/local/bin/jsmon"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 7 — Systemd
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_SVC"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=JS Monitoring Dashboard
Documentation=https://github.com/RJ-Bond/js-monitoring
Requires=docker.service
After=docker.service network-online.target

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
ok "$T_SVC_OK"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 8 — Build & Start
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_BUILD"

VOL="js-monitoring_mysql_data"

if [[ "$IS_UPDATE" == "false" ]]; then
  info "$T_BUILD_PREP"
  docker compose down -v 2>/dev/null || true
  docker kill jsmon-mysql 2>/dev/null || true
  docker rm -f jsmon-mysql 2>/dev/null || true
  sleep 2

  for attempt in 1 2; do
    docker volume inspect "$VOL" >/dev/null 2>&1 || break
    info "Removing MySQL volume (attempt ${attempt}/2)…"
    docker volume rm -f "$VOL" 2>/dev/null || true; sleep 1
  done
  docker volume inspect "$VOL" >/dev/null 2>&1 \
    && err "Cannot remove MySQL volume. Run:\n    docker volume rm -f $VOL && sudo bash install.sh"

  docker image rm mysql:5.7 mysql:5.7-debian 2>/dev/null || true
  docker system prune -f --filter "dangling=true" 2>/dev/null || true
else
  info "$T_BUILD_PREP"
  docker compose down 2>/dev/null || true
fi
docker compose config >/dev/null 2>&1 \
  || err "Invalid docker-compose.yml:\n$(docker compose config 2>&1 | head -5)"

info "$T_BUILD_PULL"
docker pull mysql:8.0.36 >/tmp/jsmon_pull.log 2>&1 || true
MYSQL_VER=$(docker run --rm mysql:8.0.36 mysqld --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
[[ "$MYSQL_VER" =~ ^8\.0 ]] || err "MySQL image check failed: got ${MYSQL_VER:-unknown} (expected 8.0.x)"
ok "🗄️  MySQL 8.0.36 ✔"

info "$T_BUILD_UP"
COMPOSE_PROF=""
[[ "$SSL_MODE_VAL" == "letsencrypt" ]] && COMPOSE_PROF="--profile ssl"
# shellcheck disable=SC2086
docker compose $COMPOSE_PROF up -d --build --remove-orphans >/tmp/jsmon_build.log 2>&1 \
  || { echo; tail -20 /tmp/jsmon_build.log >&2; err "Build failed. See /tmp/jsmon_build.log"; }

echo
while IFS=$'\t' read -r _n _s; do
  [[ -z "$_n" || "$_n" == "NAME" ]] && continue
  case "$_n" in
    jsmon-mysql)    _i="🗄️ " ;;
    jsmon-backend)  _i="⚙️ " ;;
    jsmon-frontend) _i="🖥️ " ;;
    jsmon-nginx)    _i="🌐" ;;
    jsmon-certbot)  _i="🔒" ;;
    *)              _i="📦" ;;
  esac
  if   [[ "$_s" == *"healthy"* ]]; then printf "  %s  %-24s  ${G}✔ healthy${NC}\n"   "$_i" "$_n"
  elif [[ "$_s" == *"running"* || "$_s" == *"Up"* ]]; then printf "  %s  %-24s  ${G}▶ running${NC}\n"   "$_i" "$_n"
  else printf "  %s  %-24s  ${Y}%s${NC}\n" "$_i" "$_n" "$_s"
  fi
done < <(docker compose ps --format "{{.Names}}\t{{.Status}}" 2>/dev/null)
echo

sleep 3
RUNNING_VER=$(docker compose logs mysql 2>/dev/null | grep -oP "mysqld \(mysqld \K[0-9.]+" | tail -1 || echo "")
[[ "$RUNNING_VER" =~ ^5\.7 ]] && {
  docker compose down
  err "MySQL 5.7 detected! Run:\n    docker compose down -v && docker image rm -f mysql:5.7 && sudo bash install.sh"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEP 9 — Health Checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
step "$T_HEALTH"

# MySQL
echo -e "  ${DIM}$T_MYSQL_WAIT…${NC}"
WAITED=0; LAST=""
while (( WAITED < 180 )); do
  ST=$(docker inspect --format='{{.State.Health.Status}}' jsmon-mysql 2>/dev/null || echo "starting")
  [[ "$ST" != "$LAST" ]] && { printf "  ${DIM}⏳  %-16s${NC}  [%ds]\n" "$ST" "$WAITED"; LAST="$ST"; }
  [[ "$ST" == "healthy" ]] && { ok "$T_MYSQL_OK"; break; }
  docker compose logs mysql 2>/dev/null | grep -q "ERROR\|FATAL" && {
    docker compose logs mysql 2>/dev/null | tail -15
    err "MySQL init failed. Run:\n    docker compose down && docker volume rm -f $VOL && sudo bash install.sh"
  }
  sleep 5; WAITED=$((WAITED+5))
done
ST_FINAL=$(docker inspect --format='{{.State.Health.Status}}' jsmon-mysql 2>/dev/null || echo "unknown")
[[ "$ST_FINAL" == "healthy" ]] || warn "MySQL health check timed out (status: $ST_FINAL)"

# Backend API
echo -e "\n  ${DIM}$T_HEALTH_API${NC}"
SSL_MODE_VAL=$(grep "^SSL_MODE=" .env 2>/dev/null | cut -d= -f2 || echo "none")
[[ "$SSL_MODE_VAL" != "none" ]] && HURL="https://localhost/api/v1/stats" \
                                || HURL="http://localhost/api/v1/stats"
MAX_WAIT=600; WAITED=0
while ! curl -Lksf "$HURL" >/dev/null 2>&1; do
  (( WAITED >= MAX_WAIT )) && { warn "$T_HEALTH_TIMEOUT"; docker compose ps 2>/dev/null || true; break; }
  printf "${DIM}${T_HEALTH_WAIT}${NC}\r" "$WAITED" "$MAX_WAIT"
  (( WAITED > 0 && WAITED % 60 == 0 )) && {
    echo; docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || true
  }
  sleep 5; WAITED=$((WAITED+5))
done
curl -Lksf "$HURL" >/dev/null 2>&1 && { echo; ok "$T_HEALTH_OK"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DONE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
trap - ERR

SERVER_IP=$(curl -sf https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
SSL_FINAL=$(grep "^SSL_MODE=" .env 2>/dev/null | cut -d= -f2 || echo "none")
DOM_FINAL=$(grep "^SSL_DOMAIN=" .env 2>/dev/null | cut -d= -f2 || echo "")
if   [[ "$SSL_FINAL" != "none" && -n "$DOM_FINAL" ]]; then DASH_URL="https://${DOM_FINAL}"
elif [[ "$SSL_FINAL" != "none" ]];                    then DASH_URL="https://${SERVER_IP}"
else                                                       DASH_URL="http://${SERVER_IP}"
fi

B="${G}${BD}"
BL="  ${G}${BD}║${NC}"
echo
echo -e "${B}  ╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${B}  ║                                                   ║${NC}"
echo -e "${BL}  $T_DONE_TITLE"
echo -e "${B}  ║                                                   ║${NC}"
echo -e "${B}  ╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${BL}  $T_INFO_DASH  ${C}${DASH_URL}${NC}"
echo -e "${BL}  $T_INFO_DIR   ${DIM}${INSTALL_DIR}${NC}"
echo -e "${BL}  $T_INFO_CFG   ${DIM}${INSTALL_DIR}/.env${NC}"
echo -e "${B}  ╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${BL}  ${W}$T_CMDS${NC}"
echo -e "${BL}"
echo -e "${BL}    ${Y}jsmon${NC}               →  $T_C1"
echo -e "${BL}    ${Y}systemctl status${NC}    →  $T_C2"
echo -e "${BL}    ${Y}docker compose logs${NC} →  $T_C3"
echo -e "${BL}    ${Y}systemctl restart${NC}   →  $T_C4"
echo -e "${B}  ║                                                   ║${NC}"
echo -e "${B}  ╚═══════════════════════════════════════════════════╝${NC}"
echo

if command -v jsmon &>/dev/null; then jsmon; fi
