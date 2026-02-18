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

info()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✘]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${GREEN}══ $* ══${NC}"; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Please run with sudo: sudo bash install.sh"

# ── Fix: remove stale MySQL APT repo (lunar/jammy codename on noble) ─────────
# MySQL runs in Docker, so the system APT repo is not needed and causes GPG errors.
section "Cleaning up stale APT repositories"
MYSQL_SOURCES=( /etc/apt/sources.list.d/mysql*.list /etc/apt/sources.list.d/mysql*.sources )
for f in "${MYSQL_SOURCES[@]}"; do
    if [[ -f "$f" ]]; then
        warn "Removing stale MySQL APT repo: $f"
        rm -f "$f"
    fi
done
# Also neutralise any inline entry in /etc/apt/sources.list
if grep -q "repo.mysql.com" /etc/apt/sources.list 2>/dev/null; then
    warn "Commenting out MySQL entry in /etc/apt/sources.list"
    sed -i '/repo\.mysql\.com/s/^/# /' /etc/apt/sources.list
fi
# Remove associated stale GPG keys (keybox format)
rm -f /etc/apt/trusted.gpg.d/mysql*.gpg /usr/share/keyrings/mysql*.gpg 2>/dev/null || true
info "MySQL APT repo cleanup done."

section "System Update"
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release ufw

# ── Docker ────────────────────────────────────────────────────────────────────
section "Docker"
if command -v docker &>/dev/null; then
    info "Docker already installed: $(docker --version)"
else
    info "Installing Docker…"
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    info "Docker installed: $(docker --version)"
fi

# Docker Compose plugin
if docker compose version &>/dev/null 2>&1; then
    info "Docker Compose already available: $(docker compose version)"
else
    info "Installing Docker Compose plugin…"
    apt-get install -y -qq docker-compose-plugin
fi

# ── Clone / Update repo ───────────────────────────────────────────────────────
section "Repository"
if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Repository exists — pulling latest…"
    git -C "$INSTALL_DIR" pull --ff-only
else
    info "Cloning $REPO_URL → $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── Environment file ──────────────────────────────────────────────────────────
section "Configuration"
if [[ ! -f .env ]]; then
    cp .env.example .env

    # Auto-generate secure passwords
    DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
    API_KEY=$(openssl rand -hex 32)

    sed -i "s/supersecretpassword/${DB_PASS}/g" .env
    sed -i "s/change_me_to_a_random_64char_string/${API_KEY}/g" .env
    sed -i "s/rootpassword/$(openssl rand -hex 16)/g" .env

    warn "Generated .env with random passwords."
    warn "Edit ${INSTALL_DIR}/.env to set:"
    warn "  - TELEGRAM_BOT_TOKEN (optional)"
    warn "  - TELEGRAM_DEFAULT_CHAT_ID (optional)"
    echo
    info "Press ENTER to continue, or Ctrl-C to abort and edit the file first."
    read -r
else
    info ".env already exists — keeping existing configuration."
fi

# ── Firewall ──────────────────────────────────────────────────────────────────
section "Firewall (UFW)"
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming  >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
ufw allow ssh              >/dev/null 2>&1
ufw allow 80/tcp           >/dev/null 2>&1
ufw allow 443/tcp          >/dev/null 2>&1
ufw --force enable         >/dev/null 2>&1
info "UFW configured: SSH + HTTP/HTTPS allowed."

# ── Systemd service ───────────────────────────────────────────────────────────
section "Systemd Service"
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
info "Systemd service installed and enabled on boot."

# ── Build & Start ─────────────────────────────────────────────────────────────
section "Building & Starting Services"
docker compose pull --quiet 2>/dev/null || true
docker compose up -d --build --remove-orphans

# ── Wait for healthy state ────────────────────────────────────────────────────
section "Health Check"
MAX_WAIT=120
WAITED=0
while ! curl -sf http://localhost/api/v1/stats >/dev/null 2>&1; do
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        warn "Services took too long to start. Check logs:"
        warn "  docker compose -f ${INSTALL_DIR}/docker-compose.yml logs"
        break
    fi
    printf "  Waiting for backend… (%ds)\r" "$WAITED"
    sleep 5
    WAITED=$((WAITED+5))
done

if curl -sf http://localhost/api/v1/stats >/dev/null 2>&1; then
    info "Backend is healthy!"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
SERVER_IP=$(curl -sf https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')

echo
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        JS Monitor — Installation Done!       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo
echo -e "  🌐 Dashboard:  ${GREEN}http://${SERVER_IP}${NC}"
echo -e "  📁 Directory:  ${INSTALL_DIR}"
echo -e "  🔧 Config:     ${INSTALL_DIR}/.env"
echo
echo -e "  Useful commands:"
echo -e "    ${YELLOW}systemctl status js-monitoring${NC}       # service status"
echo -e "    ${YELLOW}docker compose -C ${INSTALL_DIR} logs -f${NC}  # live logs"
echo -e "    ${YELLOW}systemctl restart js-monitoring${NC}      # restart all"
echo
