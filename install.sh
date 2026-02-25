#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════════╗
# ║   🖥️  JS Monitor — Installer  •  Ubuntu 24.04 LTS           ║
# ║   curl -fsSL https://raw.githubusercontent.com/RJ-Bond/     ║
# ║            js-monitoring/main/install.sh | sudo bash         ║
# ╚═══════════════════════════════════════════════════════════════╝
set -euo pipefail

REPO_URL="https://github.com/RJ-Bond/js-monitoring"
INSTALL_DIR="/opt/js-monitoring"
SERVICE_FILE="/etc/systemd/system/js-monitoring.service"
IS_UPDATE=false
SSL_MODE_VAL="none"

G="\033[0;32m"; Y="\033[1;33m"; R="\033[0;31m"; C="\033[0;36m"; NC="\033[0m"; BD="\033[1m"

ok()   { echo -e "  ${G}✅${NC} $*"; }
warn() { echo -e "  ${Y}⚠️ ${NC} $*"; }
err()  { echo -e "\n  ${R}❌ $*${NC}" >&2; exit 1; }
step() { echo -e "\n${C}${BD}$*${NC}"; }
ask()  { echo -en "  ${Y}▶${NC} $* "; }

on_error() {
  echo -e "\n${R}╔══════════════════════════════════════════════╗"
  echo -e   "║  ❌  Installation failed at line ${1:-?}           ║"
  echo -e   "╚══════════════════════════════════════════════╝${NC}"
  echo -e "  Logs: ${Y}docker compose --project-directory ${INSTALL_DIR} logs${NC}"
}
trap 'on_error $LINENO' ERR

# ── Checks ────────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Please run with sudo / Запустите с sudo: sudo bash install.sh"

# ── Language / Язык ──────────────────────────────────────────────────────────
AUTO_LANG=$(locale 2>/dev/null | grep -i "^LANG=" | cut -d= -f2 | cut -d_ -f1 | tr '[:upper:]' '[:lower:]' || echo "en")
[[ "$AUTO_LANG" == "ru" ]] && DEF=2 || DEF=1

echo -e "\n${G}${BD}╔══════════════════════════════════════════════╗"
echo -e    "║     🖥️  JS Monitor  —  Installer  v2.0       ║"
echo -e    "╚══════════════════════════════════════════════╝${NC}\n"
echo    "  🌐  Select language / Выберите язык:"
echo    "       1) English   2) Русский"
ask "[1/2, default ${DEF}]:"
read -r LANG_CHOICE </dev/tty
LANG_CHOICE="${LANG_CHOICE:-$DEF}"
[[ "$LANG_CHOICE" == "2" ]] && L="ru" || L="en"

# ── Strings ───────────────────────────────────────────────────────────────────
if [[ "$L" == "ru" ]]; then
  T_PREP="🔧 Подготовка системы"
  T_DOCKER="🐳 Docker"
  T_DOCKER_OK="Docker уже установлен"
  T_DOCKER_INST="Устанавливаю Docker…"
  T_REPO="📦 Репозиторий"
  T_REPO_UPDATE="Обновляю до последней версии…"
  T_REPO_CLONE="Клонирую репозиторий"
  T_CONFIG="⚙️  Конфигурация"
  T_URL_PROMPT="Домен или IP сервера (для Steam auth и ссылок, пусто = localhost)"
  T_ENV_OK="Создан .env с безопасными паролями"
  T_ENV_EXISTS=".env уже существует — конфигурация сохранена"
  T_ENV_HINT="Дополнительно в ${INSTALL_DIR}/.env:"
  T_ENV_TG="  • TELEGRAM_BOT_TOKEN / TELEGRAM_DEFAULT_CHAT_ID (опционально)"
  T_ENV_CONT="Нажмите ENTER для продолжения…"
  T_SSL="🔒 SSL / HTTPS"
  T_SSL_PROMPT="Выберите режим SSL:"
  T_SSL_1="1) HTTP (по умолчанию)"
  T_SSL_2="2) HTTPS — Let's Encrypt (бесплатный автоматический)"
  T_SSL_3="3) HTTPS — свой сертификат"
  T_SSL_DOMAIN="Домен (например: monitor.example.com)"
  T_SSL_EMAIL="Email для Let's Encrypt"
  T_SSL_CERT="🔑 Получаю сертификат от Let's Encrypt…"
  T_SSL_CERT_OK="SSL-сертификат получен"
  T_SSL_CRT="Путь к файлу сертификата (fullchain.pem)"
  T_SSL_KEY="Путь к файлу ключа (privkey.pem)"
  T_FW="🛡️  Брандмауэр (UFW)"
  T_FW_OK="UFW: SSH + HTTP/HTTPS разрешены"
  T_SVC="⚡ Systemd-сервис"
  T_SVC_OK="Сервис установлен и включён в автозапуск"
  T_BUILD="🚀 Сборка и запуск"
  T_MYSQL_PREP="Подготовка MySQL 8.0…"
  T_MYSQL_OK="MySQL 8.0 работает"
  T_HEALTH="💓 Проверка готовности"
  T_HEALTH_WAIT="  ⏳ Ожидание… %dс / %dс"
  T_HEALTH_OK="Все сервисы работают!"
  T_HEALTH_TIMEOUT="Сервисы долго стартуют — проверьте логи"
  T_DONE="✨ Установка JS Monitor завершена!"
  T_DASH="🌐 Панель"
  T_DIR="📁 Директория"
  T_CFG="🔧 Конфигурация"
  T_CMDS="📋 Полезные команды:"
  T_C1="# меню управления"
  T_C2="# статус"
  T_C3="# логи"
  T_C4="# перезапуск"
else
  T_PREP="🔧 System Preparation"
  T_DOCKER="🐳 Docker"
  T_DOCKER_OK="Docker already installed"
  T_DOCKER_INST="Installing Docker…"
  T_REPO="📦 Repository"
  T_REPO_UPDATE="Pulling latest changes…"
  T_REPO_CLONE="Cloning repository"
  T_CONFIG="⚙️  Configuration"
  T_URL_PROMPT="Server domain or IP (for Steam auth & links, empty = localhost)"
  T_ENV_OK="Generated .env with secure random passwords"
  T_ENV_EXISTS=".env already exists — keeping current config"
  T_ENV_HINT="Optional settings in ${INSTALL_DIR}/.env:"
  T_ENV_TG="  • TELEGRAM_BOT_TOKEN / TELEGRAM_DEFAULT_CHAT_ID (optional)"
  T_ENV_CONT="Press ENTER to continue…"
  T_SSL="🔒 SSL / HTTPS"
  T_SSL_PROMPT="Select SSL mode:"
  T_SSL_1="1) HTTP (default)"
  T_SSL_2="2) HTTPS — Let's Encrypt (free automatic)"
  T_SSL_3="3) HTTPS — Custom certificate"
  T_SSL_DOMAIN="Domain (e.g. monitor.example.com)"
  T_SSL_EMAIL="Email for Let's Encrypt"
  T_SSL_CERT="🔑 Obtaining Let's Encrypt certificate…"
  T_SSL_CERT_OK="SSL certificate obtained"
  T_SSL_CRT="Path to certificate file (fullchain.pem)"
  T_SSL_KEY="Path to private key file (privkey.pem)"
  T_FW="🛡️  Firewall (UFW)"
  T_FW_OK="UFW: SSH + HTTP/HTTPS allowed"
  T_SVC="⚡ Systemd Service"
  T_SVC_OK="Service installed and enabled on boot"
  T_BUILD="🚀 Build & Start"
  T_MYSQL_PREP="Preparing MySQL 8.0…"
  T_MYSQL_OK="MySQL 8.0 is running"
  T_HEALTH="💓 Health Check"
  T_HEALTH_WAIT="  ⏳ Waiting… %ds / %ds"
  T_HEALTH_OK="All services are healthy!"
  T_HEALTH_TIMEOUT="Services are slow to start — check logs"
  T_DONE="✨ JS Monitor installation complete!"
  T_DASH="🌐 Dashboard"
  T_DIR="📁 Directory"
  T_CFG="🔧 Config"
  T_CMDS="📋 Useful commands:"
  T_C1="# management menu"
  T_C2="# status"
  T_C3="# live logs"
  T_C4="# restart"
fi

# ── 1. System Preparation ─────────────────────────────────────────────────────
step "$T_PREP"

# Remove stale MySQL APT repos (legacy cleanup)
for f in /etc/apt/sources.list.d/mysql*.list /etc/apt/sources.list.d/mysql*.sources; do
  [[ -f "$f" ]] && rm -f "$f" && warn "Removed stale repo: $f"
done
grep -q "repo.mysql.com" /etc/apt/sources.list 2>/dev/null \
  && sed -i '/repo\.mysql\.com/s/^/# /' /etc/apt/sources.list
rm -f /etc/apt/trusted.gpg.d/mysql*.gpg /usr/share/keyrings/mysql*.gpg 2>/dev/null || true

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release ufw openssl
ok "$T_PREP"

# ── 2. Docker ─────────────────────────────────────────────────────────────────
step "$T_DOCKER"
if command -v docker &>/dev/null; then
  ok "$T_DOCKER_OK: $(docker --version | grep -oP '\d+\.\d+\.\d+')"
else
  warn "$T_DOCKER_INST"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "Docker installed: $(docker --version | grep -oP '\d+\.\d+\.\d+')"
fi
if ! docker compose version &>/dev/null 2>&1; then
  apt-get install -y -qq docker-compose-plugin
fi
ok "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'ok')"

# ── 3. Repository ─────────────────────────────────────────────────────────────
step "$T_REPO"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  IS_UPDATE=true
  ok "$T_REPO_UPDATE"
  git -C "$INSTALL_DIR" pull --ff-only
else
  ok "$T_REPO_CLONE → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── 4. Configuration ──────────────────────────────────────────────────────────
step "$T_CONFIG"
if [[ ! -f .env ]]; then
  cp .env.example .env
  # Generate secure random secrets
  DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  API_KEY=$(openssl rand -hex 32)
  JWT_SEC=$(openssl rand -hex 32)
  ROOT_PASS=$(openssl rand -hex 16)
  sed -i "s/supersecretpassword/${DB_PASS}/g"                  .env
  sed -i "s/change_me_to_a_random_64char_string/${API_KEY}/g"  .env
  sed -i "s/change_me_to_a_random_64char_jwt_secret/${JWT_SEC}/g" .env
  sed -i "s/rootpassword/${ROOT_PASS}/g"                       .env

  # APP_URL
  echo
  ask "$T_URL_PROMPT"$'\n'"  [http://localhost]: "
  read -r APP_URL_INPUT </dev/tty
  if [[ -n "$APP_URL_INPUT" ]]; then
    APP_URL_INPUT="${APP_URL_INPUT%/}"
    [[ "$APP_URL_INPUT" =~ ^https?:// ]] || APP_URL_INPUT="http://${APP_URL_INPUT}"
    sed -i "s|APP_URL=.*|APP_URL=${APP_URL_INPUT}|" .env
  fi

  # ── SSL ──────────────────────────────────────────────────────────────────────
  echo
  step "$T_SSL"
  echo "  $T_SSL_PROMPT"
  echo "    $T_SSL_1"
  echo "    $T_SSL_2"
  echo "    $T_SSL_3"
  ask "[1/2/3, default 1]:"
  read -r SSL_CHOICE </dev/tty
  SSL_CHOICE="${SSL_CHOICE:-1}"

  case "$SSL_CHOICE" in
  2)
    SSL_MODE_VAL="letsencrypt"
    ask "$T_SSL_DOMAIN:"; read -r SSL_DOMAIN_VAL </dev/tty
    ask "$T_SSL_EMAIL:";  read -r SSL_EMAIL      </dev/tty
    [[ -n "$SSL_DOMAIN_VAL" ]] && {
      sed -i "s|APP_URL=.*|APP_URL=https://${SSL_DOMAIN_VAL}|" .env
      sed -i "s|SSL_DOMAIN=.*|SSL_DOMAIN=${SSL_DOMAIN_VAL}|" .env
    }
    sed -i "s|SSL_MODE=.*|SSL_MODE=letsencrypt|" .env
    warn "$T_SSL_CERT"
    apt-get install -y -qq certbot
    mkdir -p /var/www/certbot
    certbot certonly --standalone --non-interactive --agree-tos \
      --email "$SSL_EMAIL" -d "$SSL_DOMAIN_VAL" --preferred-challenges http
    sed "s|{DOMAIN}|${SSL_DOMAIN_VAL}|g" nginx/nginx-ssl.conf > nginx/nginx.conf
    ok "$T_SSL_CERT_OK: $SSL_DOMAIN_VAL"
    ;;
  3)
    SSL_MODE_VAL="custom"
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
    ok "$T_SSL_CERT_OK${SSL_DOMAIN_VAL:+ ($SSL_DOMAIN_VAL)}"
    ;;
  *)
    SSL_MODE_VAL="none"
    ;;
  esac

  ok "$T_ENV_OK"
  warn "$T_ENV_HINT"
  warn "$T_ENV_TG"
  echo; ask "$T_ENV_CONT"; read -r </dev/tty
else
  ok "$T_ENV_EXISTS"
  SSL_MODE_VAL=$(grep "^SSL_MODE=" .env 2>/dev/null | cut -d= -f2 || echo "none")
fi

# ── 5. Firewall ───────────────────────────────────────────────────────────────
step "$T_FW"
ufw allow ssh     >/dev/null 2>&1 || true
ufw allow 80/tcp  >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw default deny incoming  >/dev/null 2>&1 || true
ufw default allow outgoing >/dev/null 2>&1 || true
ufw --force enable         >/dev/null 2>&1 || true
ok "$T_FW_OK"

# ── 6. jsmon CLI ──────────────────────────────────────────────────────────────
cp "${INSTALL_DIR}/jsmon.sh" /usr/local/bin/jsmon
chmod +x /usr/local/bin/jsmon
ok "jsmon CLI → /usr/local/bin/jsmon"

# ── 7. Systemd service ────────────────────────────────────────────────────────
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

# ── 8. Build & Start ──────────────────────────────────────────────────────────
step "$T_BUILD"
warn "$T_MYSQL_PREP"

# Stop containers and clean MySQL volume (ensures clean MySQL 8.0 init)
docker compose down -v 2>/dev/null || true
docker kill jsmon-mysql 2>/dev/null || true
docker rm -f jsmon-mysql 2>/dev/null || true
sleep 2

VOL="js-monitoring_mysql_data"
for attempt in 1 2; do
  docker volume inspect "$VOL" >/dev/null 2>&1 || break
  warn "Removing MySQL volume (attempt $attempt)…"
  docker volume rm -f "$VOL" 2>/dev/null || true
  sleep 1
done
docker volume inspect "$VOL" >/dev/null 2>&1 \
  && err "Cannot remove MySQL volume $VOL. Run: docker volume rm -f $VOL && sudo bash install.sh"

# Clean legacy images
docker image rm mysql:5.7 mysql:5.7-debian 2>/dev/null || true
docker system prune -f --filter "dangling=true" 2>/dev/null || true

# Validate compose config
docker compose config >/dev/null 2>&1 || err "Invalid docker-compose.yml: $(docker compose config 2>&1 | head -5)"

# Pull & verify MySQL 8.0.36
docker pull mysql:8.0.36 2>&1 | grep -E "(Pulling|Downloaded|Status|already)" || true
MYSQL_VER=$(docker run --rm mysql:8.0.36 mysqld --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
[[ "$MYSQL_VER" =~ ^8\.0 ]] || err "MySQL image check failed: got $MYSQL_VER (expected 8.0.x)"
ok "MySQL 8.0.36 verified ($MYSQL_VER)"

# Start containers
COMPOSE_PROF=""
[[ "$SSL_MODE_VAL" == "letsencrypt" ]] && COMPOSE_PROF="--profile ssl"
# shellcheck disable=SC2086
docker compose $COMPOSE_PROF up -d --build --remove-orphans 2>&1 | tee /tmp/jsmon_build.log \
  || err "Build failed. See /tmp/jsmon_build.log"

echo
docker compose ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || true

# Verify MySQL 8.0 in running container
sleep 3
RUNNING_VER=$(docker compose logs mysql 2>/dev/null | grep -oP "mysqld \(mysqld \K[0-9.]+" | tail -1 || echo "")
[[ "$RUNNING_VER" =~ ^5\.7 ]] && {
  docker compose down
  err "MySQL 5.7 detected instead of 8.0! Run: docker compose down -v && docker image rm -f mysql:5.7 && sudo bash install.sh"
}

# ── 9. Health Checks ──────────────────────────────────────────────────────────
step "$T_HEALTH"

# Wait for MySQL healthy (up to 3 min)
echo -e "  🗄️  MySQL…"
WAITED=0; LAST=""
while (( WAITED < 180 )); do
  ST=$(docker compose ps mysql 2>/dev/null | tail -1 | awk '{print $NF}' || echo "…")
  [[ "$ST" != "$LAST" ]] && { printf "  %-45s [%ds]\n" "$ST" "$WAITED"; LAST="$ST"; }
  [[ "$ST" == *"healthy"* ]] && { ok "$T_MYSQL_OK"; break; }
  docker compose logs mysql 2>/dev/null | grep -q "ERROR\|FATAL" && {
    docker compose logs mysql 2>/dev/null | tail -20
    err "MySQL error during init. Run: docker compose down && docker volume rm -f $VOL && sudo bash install.sh"
  }
  sleep 5; WAITED=$((WAITED+5))
done
ST_FINAL=$(docker compose ps mysql 2>/dev/null | tail -1 | awk '{print $NF}' || echo "unknown")
[[ "$ST_FINAL" == *"healthy"* ]] || warn "MySQL health check timeout (status: $ST_FINAL)"

# Wait for backend API (up to 10 min)
echo -e "  🌐  Backend API…"
SSL_MODE_VAL=$(grep "^SSL_MODE=" .env 2>/dev/null | cut -d= -f2 || echo "none")
[[ "$SSL_MODE_VAL" != "none" ]] && HURL="https://localhost/api/v1/stats" || HURL="http://localhost/api/v1/stats"
MAX_WAIT=600; WAITED=0
while ! curl -Lksf "$HURL" >/dev/null 2>&1; do
  (( WAITED >= MAX_WAIT )) && { warn "$T_HEALTH_TIMEOUT"; docker compose ps 2>/dev/null || true; break; }
  printf "  ${T_HEALTH_WAIT}\r" "$WAITED" "$MAX_WAIT"
  (( WAITED > 0 && WAITED % 60 == 0 )) && {
    echo; docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || true
  }
  sleep 5; WAITED=$((WAITED+5))
done
curl -Lksf "$HURL" >/dev/null 2>&1 && { echo; ok "$T_HEALTH_OK"; }

# ── Done ──────────────────────────────────────────────────────────────────────
trap - ERR

SERVER_IP=$(curl -sf https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
SSL_FINAL=$(grep "^SSL_MODE=" .env 2>/dev/null | cut -d= -f2 || echo "none")
DOM_FINAL=$(grep "^SSL_DOMAIN=" .env 2>/dev/null | cut -d= -f2 || echo "")
if   [[ "$SSL_FINAL" != "none" && -n "$DOM_FINAL" ]]; then DASH_URL="https://${DOM_FINAL}"
elif [[ "$SSL_FINAL" != "none" ]];                    then DASH_URL="https://${SERVER_IP}"
else                                                       DASH_URL="http://${SERVER_IP}"
fi

echo
echo -e "${G}${BD}╔══════════════════════════════════════════════╗"
echo -e   "║              $T_DONE              ║"
echo -e   "╚══════════════════════════════════════════════╝${NC}"
echo
echo -e "  $T_DASH    ${G}${DASH_URL}${NC}"
echo -e "  $T_DIR     ${INSTALL_DIR}"
echo -e "  $T_CFG     ${INSTALL_DIR}/.env"
echo
echo -e "  $T_CMDS"
echo -e "    ${Y}jsmon${NC}                                          $T_C1"
echo -e "    ${Y}systemctl status js-monitoring${NC}                 $T_C2"
echo -e "    ${Y}docker compose -C ${INSTALL_DIR} logs -f${NC}       $T_C3"
echo -e "    ${Y}systemctl restart js-monitoring${NC}                $T_C4"
echo

if command -v jsmon &>/dev/null; then jsmon; fi
