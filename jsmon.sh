#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#   jsmon — JS Monitor management CLI
#   Usage: jsmon [status|logs|restart|start|stop|update|config|lang|help]
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

INSTALL_DIR="/opt/js-monitoring"
DC="docker compose --project-directory ${INSTALL_DIR}"
VERSION="v2.1.0"

# ── Colors (same palette as install.sh) ───────────────────────────────
G="\033[0;32m"; Y="\033[1;33m"; R="\033[0;31m"; C="\033[0;36m"
M="\033[0;35m"; W="\033[1;37m"; DIM="\033[2m"; NC="\033[0m"; BD="\033[1m"

ok()   { echo -e "  ${G}✔${NC}  $*"; }
warn() { echo -e "  ${Y}⚠${NC}  $*"; }
info() { echo -e "  ${DIM}→${NC}  $*"; }
err()  { echo -e "\n  ${R}✖  $*${NC}" >&2; exit 1; }

BOX_TOP="${G}${BD}  ╔═══════════════════════════════════════════════════╗${NC}"
BOX_MID="${G}${BD}  ╠═══════════════════════════════════════════════════╣${NC}"
BOX_BOT="${G}${BD}  ╚═══════════════════════════════════════════════════╝${NC}"
BOX_L="  ${G}${BD}║${NC}"

# ── Sanity check ──────────────────────────────────────────────────────
[[ -d "$INSTALL_DIR" ]] || err "JS Monitor not found at ${INSTALL_DIR}. Run the installer first."

# ── Language ──────────────────────────────────────────────────────────
LANG_FILE="${INSTALL_DIR}/.jsmon-lang"
if [[ -f "$LANG_FILE" ]]; then
  JSMON_LANG=$(cat "$LANG_FILE" 2>/dev/null || echo "en")
else
  JSMON_LANG=$(locale 2>/dev/null | grep -i "^LANG=" | cut -d= -f2 | cut -d_ -f1 | tr '[:upper:]' '[:lower:]' 2>/dev/null || echo "en")
fi
[[ "$JSMON_LANG" == "ru" || "$JSMON_LANG" == "en" ]] || JSMON_LANG="en"

if [[ "$JSMON_LANG" == "ru" ]]; then
  L_MENU_TITLE="🖥️   JS Monitor  ·  Управление  ·  ${VERSION}"
  M1="📋  Все логи (live)"
  M2="⚙️   Логи бэкенда"
  M3="🖥️   Логи фронтенда"
  M4="🌐  Логи nginx"
  M5="🗄️   Логи MySQL"
  M6="📊  Статус контейнеров"
  M7="🔄  Перезапустить все сервисы"
  M8="⬆️   Обновить (git pull + rebuild)"
  M0="👋  Выход"
  MP="Выберите пункт"
  L_HINT="Ctrl-C — выход из логов, возврат в меню"
  L_INVALID="Неверный ввод — введите число от 0 до 8"
  L_NOT_ROOT="Некоторые команды требуют sudo. Запустите: sudo jsmon"
  L_EXIT="До свидания! 👋"
  L_STATUS="Статус контейнеров"
  L_LOGS_ALL="Все логи (live)"
  L_LOGS_SVC="Логи сервиса"
  L_RESTART_ALL="Перезапуск всех сервисов…"
  L_RESTART_SVC="Перезапуск сервиса"
  L_START="Запуск сервисов…"
  L_STOP="Остановка сервисов…"
  L_UPDATE_PULL="Получение последних изменений…"
  L_UPDATE_BUILD="Пересборка контейнеров…"
  L_UPDATE_DONE="Обновление завершено! ✅"
  L_CONFIG_HINT="Конфигурация"
  L_LANG_SET="Язык интерфейса сохранён:"
  L_LANG_USAGE="Использование: jsmon lang <ru|en>"
  HELP_TITLE="Использование: jsmon [команда]"
  HELP_CMDS="Команды:"
  HELP_MENU="  (без аргументов)  — интерактивное меню"
  HELP_STATUS="  status            — статус контейнеров"
  HELP_LOGS="  logs [сервис]     — логи (backend|frontend|nginx|mysql)"
  HELP_RESTART="  restart [сервис]  — перезапуск"
  HELP_START="  start             — запустить сервисы"
  HELP_STOP="  stop              — остановить сервисы"
  HELP_UPDATE="  update            — git pull + пересборка"
  HELP_CONFIG="  config            — открыть .env в редакторе"
  HELP_LANG="  lang <ru|en>      — сохранить язык"
  HELP_SSL="  ssl               — включить HTTPS (самоподписанный сертификат)"
  HELP_HELP="  help              — показать справку"
else
  L_MENU_TITLE="🖥️   JS Monitor  ·  Management  ·  ${VERSION}"
  M1="📋  All logs (live)"
  M2="⚙️   Backend logs"
  M3="🖥️   Frontend logs"
  M4="🌐  Nginx logs"
  M5="🗄️   MySQL logs"
  M6="📊  Container status"
  M7="🔄  Restart all services"
  M8="⬆️   Update (git pull + rebuild)"
  M0="👋  Exit"
  MP="Choose option"
  L_HINT="Ctrl-C — exit logs and return to menu"
  L_INVALID="Invalid input — enter a number from 0 to 8"
  L_NOT_ROOT="Some commands require sudo. Run: sudo jsmon"
  L_EXIT="Goodbye! 👋"
  L_STATUS="Container status"
  L_LOGS_ALL="All logs (live)"
  L_LOGS_SVC="Service logs"
  L_RESTART_ALL="Restarting all services…"
  L_RESTART_SVC="Restarting service"
  L_START="Starting services…"
  L_STOP="Stopping services…"
  L_UPDATE_PULL="Pulling latest changes…"
  L_UPDATE_BUILD="Rebuilding containers…"
  L_UPDATE_DONE="Update complete! ✅"
  L_CONFIG_HINT="Config file"
  L_LANG_SET="Interface language saved:"
  L_LANG_USAGE="Usage: jsmon lang <ru|en>"
  HELP_TITLE="Usage: jsmon [command]"
  HELP_CMDS="Commands:"
  HELP_MENU="  (no args)         — interactive management menu"
  HELP_STATUS="  status            — show container status"
  HELP_LOGS="  logs [service]    — logs (backend|frontend|nginx|mysql)"
  HELP_RESTART="  restart [service] — restart all or one service"
  HELP_START="  start             — start all services"
  HELP_STOP="  stop              — stop all services"
  HELP_UPDATE="  update            — git pull + rebuild containers"
  HELP_CONFIG="  config            — open .env in editor"
  HELP_LANG="  lang <ru|en>      — save interface language"
  HELP_SSL="  ssl               — enable HTTPS with a self-signed certificate"
  HELP_HELP="  help              — show this help"
fi

# ── Helpers ───────────────────────────────────────────────────────────
require_root() {
  [[ $EUID -eq 0 ]] || err "$L_NOT_ROOT"
}

run_logs() {
  trap '' INT
  $DC logs -f --tail=200 "$@" || true
  trap - INT
}

show_status() {
  echo
  while IFS=$'\t' read -r _n _s; do
    [[ -z "$_n" ]] && continue
    case "$_n" in
      jsmon-mysql)    _i="🗄️ " ;;
      jsmon-backend)  _i="⚙️ " ;;
      jsmon-frontend) _i="🖥️ " ;;
      jsmon-nginx)    _i="🌐" ;;
      jsmon-certbot)  _i="🔒" ;;
      *)              _i="📦" ;;
    esac
    if   [[ "$_s" == *"healthy"* ]]; then printf "  %s  %-24s  ${G}✔ healthy${NC}\n"  "$_i" "$_n"
    elif [[ "$_s" == *"running"* || "$_s" == *"Up"* ]]; then printf "  %s  %-24s  ${G}▶ running${NC}\n" "$_i" "$_n"
    else printf "  %s  %-24s  ${Y}%s${NC}\n" "$_i" "$_n" "$_s"
    fi
  done < <($DC ps --format "{{.Names}}\t{{.Status}}" 2>/dev/null)
  echo
}

# ── Commands ──────────────────────────────────────────────────────────
cmd_status() {
  echo -e "\n${BOX_MID}"
  echo -e "${BOX_L}  ${W}${L_STATUS}${NC}"
  echo -e "${BOX_MID}"
  show_status
}

cmd_logs() {
  local svc="${1:-}"
  if [[ -n "$svc" ]]; then
    echo -e "\n${BOX_L}  ${W}${L_LOGS_SVC}: ${svc}${NC}"
    run_logs "$svc"
  else
    echo -e "\n${BOX_L}  ${W}${L_LOGS_ALL}${NC}"
    run_logs
  fi
}

cmd_restart() {
  require_root
  local svc="${1:-}"
  if [[ -n "$svc" ]]; then
    info "${L_RESTART_SVC}: ${svc}"
    $DC restart "$svc"
  else
    info "$L_RESTART_ALL"
    $DC restart
  fi
  show_status
}

cmd_start() {
  require_root
  info "$L_START"
  $DC up -d
  show_status
}

cmd_stop() {
  require_root
  info "$L_STOP"
  $DC stop
  show_status
}

cmd_update() {
  require_root
  echo -e "\n${BOX_MID}"
  echo -e "${BOX_L}  ${M8}"
  echo -e "${BOX_MID}"
  info "$L_UPDATE_PULL"
  git -C "$INSTALL_DIR" pull --ff-only
  info "$L_UPDATE_BUILD"
  $DC up -d --build --remove-orphans >/tmp/jsmon_update.log 2>&1 \
    || { tail -20 /tmp/jsmon_update.log >&2; err "Build failed. See /tmp/jsmon_update.log"; }
  ok "$L_UPDATE_DONE"
  show_status
}

cmd_config() {
  local env_file="${INSTALL_DIR}/.env"
  [[ -f "$env_file" ]] || err "${L_CONFIG_HINT}: ${env_file} not found"
  info "${L_CONFIG_HINT}: ${env_file}"
  "${EDITOR:-nano}" "$env_file"
}

cmd_lang() {
  local l="${1:-}"
  if [[ "$l" != "ru" && "$l" != "en" ]]; then
    warn "$L_LANG_USAGE"; exit 1
  fi
  echo "$l" > "$LANG_FILE"
  ok "${L_LANG_SET} ${l}"
}

cmd_ssl() {
  require_root

  local ssl_dir="${INSTALL_DIR}/nginx/ssl"
  local cfg_src="${INSTALL_DIR}/nginx/nginx-ssl-custom.conf"
  local cfg_dst="${INSTALL_DIR}/nginx/nginx.conf"

  [[ -f "$cfg_src" ]] || err "SSL config template not found: ${cfg_src}"
  command -v openssl >/dev/null 2>&1 || err "openssl not found. Install it first: apt-get install openssl"

  mkdir -p "$ssl_dir"

  if [[ -f "${ssl_dir}/fullchain.pem" && -f "${ssl_dir}/privkey.pem" ]]; then
    ok "Certificate already exists at ${ssl_dir}/ — skipping generation."
  else
    # Extract domain from APP_URL in .env, fall back to hostname
    local domain
    domain=$(grep -E "^APP_URL=" "${INSTALL_DIR}/.env" 2>/dev/null \
      | sed 's|^APP_URL=https\?://||;s|/.*||' || true)
    [[ -n "$domain" ]] || domain=$(hostname -f 2>/dev/null || echo "jsmonitor")

    info "Generating self-signed certificate for: ${domain}"
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "${ssl_dir}/privkey.pem" \
      -out    "${ssl_dir}/fullchain.pem" \
      -subj   "/C=XX/O=JSMonitor/CN=${domain}" 2>/dev/null
    ok "Certificate generated: ${ssl_dir}/"
  fi

  cp "$cfg_src" "$cfg_dst"
  ok "Activated SSL nginx config."

  $DC restart nginx
  ok "Nginx restarted — HTTPS is now active on port 443."
  warn "Certificate is self-signed. The BepInEx plugin bypasses cert validation automatically."
}

show_help() {
  echo
  echo -e "${BOX_TOP}"
  echo -e "${BOX_L}  ${W}${HELP_TITLE}${NC}"
  echo -e "${BOX_MID}"
  echo -e "${BOX_L}  ${DIM}${HELP_CMDS}${NC}"
  echo -e "${BOX_L}  ${HELP_MENU}"
  echo -e "${BOX_L}  ${HELP_STATUS}"
  echo -e "${BOX_L}  ${HELP_LOGS}"
  echo -e "${BOX_L}  ${HELP_RESTART}"
  echo -e "${BOX_L}  ${HELP_START}"
  echo -e "${BOX_L}  ${HELP_STOP}"
  echo -e "${BOX_L}  ${HELP_UPDATE}"
  echo -e "${BOX_L}  ${HELP_CONFIG}"
  echo -e "${BOX_L}  ${HELP_LANG}"
  echo -e "${BOX_L}  ${HELP_SSL}"
  echo -e "${BOX_L}  ${HELP_HELP}"
  echo -e "${BOX_BOT}"
  echo
}

# ── Interactive menu ──────────────────────────────────────────────────
show_menu() {
  echo
  echo -e "${BOX_TOP}"
  echo -e "${BOX_L}  ${W}${L_MENU_TITLE}${NC}"
  echo -e "${BOX_MID}"
  echo -e "${BOX_L}"
  echo -e "${BOX_L}  ${Y}1)${NC}  ${M1}"
  echo -e "${BOX_L}  ${Y}2)${NC}  ${M2}"
  echo -e "${BOX_L}  ${Y}3)${NC}  ${M3}"
  echo -e "${BOX_L}  ${Y}4)${NC}  ${M4}"
  echo -e "${BOX_L}  ${Y}5)${NC}  ${M5}"
  echo -e "${BOX_L}"
  echo -e "${BOX_L}  ${Y}6)${NC}  ${M6}"
  echo -e "${BOX_L}  ${Y}7)${NC}  ${M7}"
  echo -e "${BOX_L}  ${Y}8)${NC}  ${M8}"
  echo -e "${BOX_L}"
  echo -e "${BOX_L}  ${Y}0)${NC}  ${M0}"
  echo -e "${BOX_L}"
  echo -e "${BOX_MID}"
  echo -e "${BOX_L}  ${DIM}ℹ  ${L_HINT}${NC}"
  echo -e "${BOX_BOT}"
  echo
  echo -ne "  ${Y}?${NC}  ${W}${MP} [0-8]:${NC} "
}

run_menu() {
  while true; do
    show_menu
    read -r CHOICE </dev/tty || break
    echo
    case "${CHOICE}" in
      1) cmd_logs          ;;
      2) cmd_logs backend  ;;
      3) cmd_logs frontend ;;
      4) cmd_logs nginx    ;;
      5) cmd_logs mysql    ;;
      6) cmd_status        ;;
      7) cmd_restart       ;;
      8) cmd_update        ;;
      0) echo -e "\n  ${G}${L_EXIT}${NC}\n"; break ;;
      *) warn "$L_INVALID" ;;
    esac
  done
}

# ── Dispatch ──────────────────────────────────────────────────────────
CMD="${1:-}"
shift || true

case "$CMD" in
  "")            run_menu         ;;
  status)        cmd_status       ;;
  logs)          cmd_logs "$@"    ;;
  restart)       cmd_restart "$@" ;;
  start)         cmd_start        ;;
  stop)          cmd_stop         ;;
  update)        cmd_update       ;;
  config)        cmd_config       ;;
  lang)          cmd_lang "$@"    ;;
  ssl)           cmd_ssl          ;;
  help|--help|-h) show_help       ;;
  *)
    warn "Unknown command: ${CMD}"
    echo
    show_help
    exit 1
    ;;
esac
