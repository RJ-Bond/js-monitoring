#!/usr/bin/env bash
# ============================================================================
#  jsmon — JS Monitor management CLI
#  Installed to /usr/local/bin/jsmon by install.sh
#
#  Usage:
#    jsmon                    — interactive management menu
#    jsmon status             — show container status
#    jsmon logs               — all logs (live)
#    jsmon logs <svc>         — logs for backend|frontend|nginx|mysql
#    jsmon restart [svc]      — restart all or one service
#    jsmon start              — start all services
#    jsmon stop               — stop all services
#    jsmon update             — pull latest code and rebuild containers
#    jsmon config             — open .env in $EDITOR
#    jsmon help               — show this help
# ============================================================================
set -euo pipefail

INSTALL_DIR="/opt/js-monitoring"
DC="docker compose --project-directory ${INSTALL_DIR}"

GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; CYAN="\033[0;36m"; NC="\033[0m"
BOLD="\033[1m"

info()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
error()   { echo -e "${RED}[✘]${NC} $*" >&2; exit 1; }
section() { echo -e "\n${CYAN}${BOLD}── $* ──${NC}"; }

# ── Sanity check ──────────────────────────────────────────────────────────────
[[ -d "$INSTALL_DIR" ]] || error "JS Monitor not found at ${INSTALL_DIR}. Run the installer first."

# ── Language auto-detection ───────────────────────────────────────────────────
AUTO_LANG=$(locale 2>/dev/null | grep -i "^LANG=" | cut -d= -f2 | cut -d_ -f1 | tr '[:upper:]' '[:lower:]' 2>/dev/null || echo "en")

if [[ "$AUTO_LANG" == "ru" ]]; then
    L_STATUS="Статус контейнеров"
    L_LOGS_ALL="Все логи (live)"
    L_LOGS_SVC="Логи сервиса"
    L_RESTART="Перезапуск"
    L_RESTART_ALL="Перезапуск всех сервисов…"
    L_RESTART_SVC="Перезапуск сервиса"
    L_START="Запуск сервисов…"
    L_STOP="Остановка сервисов…"
    L_UPDATE="Обновление и пересборка…"
    L_UPDATE_PULL="Получение последних изменений…"
    L_UPDATE_BUILD="Пересборка контейнеров…"
    L_UPDATE_DONE="Обновление завершено!"
    L_CONFIG="Открытие конфигурации в редакторе…"
    L_CONFIG_HINT="Файл конфигурации"
    L_EXIT="До свидания!"
    L_INVALID="Неверный ввод — введите число от 0 до 8"
    L_HINT="Ctrl-C — выход из логов, возврат в меню"
    L_NOT_ROOT="Некоторые команды требуют sudo. Запустите: sudo jsmon"
    L_MENU_TITLE=" Меню управления JS Monitor "
    M1="Все логи (live)"
    M2="Логи бэкенда"
    M3="Логи фронтенда"
    M4="Логи nginx"
    M5="Логи MySQL"
    M6="Статус контейнеров"
    M7="Перезапустить все сервисы"
    M8="Обновить (git pull + rebuild)"
    M0="Выход"
    MP="Выберите пункт"
    HELP_TITLE="Использование: jsmon [команда]"
    HELP_CMDS="Команды:"
    HELP_MENU="  (без аргументов)  — интерактивное меню"
    HELP_STATUS="  status            — статус контейнеров"
    HELP_LOGS="  logs [сервис]     — логи (backend|frontend|nginx|mysql)"
    HELP_RESTART="  restart [сервис]  — перезапуск всех или одного сервиса"
    HELP_START="  start             — запустить все сервисы"
    HELP_STOP="  stop              — остановить все сервисы"
    HELP_UPDATE="  update            — git pull + пересборка контейнеров"
    HELP_CONFIG="  config            — открыть .env в редакторе"
    HELP_HELP="  help              — показать эту справку"
else
    L_STATUS="Container status"
    L_LOGS_ALL="All logs (live)"
    L_LOGS_SVC="Service logs"
    L_RESTART="Restart"
    L_RESTART_ALL="Restarting all services…"
    L_RESTART_SVC="Restarting service"
    L_START="Starting services…"
    L_STOP="Stopping services…"
    L_UPDATE="Updating and rebuilding…"
    L_UPDATE_PULL="Pulling latest changes…"
    L_UPDATE_BUILD="Rebuilding containers…"
    L_UPDATE_DONE="Update complete!"
    L_CONFIG="Opening config in editor…"
    L_CONFIG_HINT="Config file"
    L_EXIT="Goodbye!"
    L_INVALID="Invalid input — enter a number from 0 to 8"
    L_HINT="Ctrl-C — exit logs and return to menu"
    L_NOT_ROOT="Some commands require sudo. Run: sudo jsmon"
    L_MENU_TITLE=" JS Monitor Management Menu "
    M1="All logs (live)"
    M2="Backend logs"
    M3="Frontend logs"
    M4="Nginx logs"
    M5="MySQL logs"
    M6="Container status"
    M7="Restart all services"
    M8="Update (git pull + rebuild)"
    M0="Exit"
    MP="Choose option"
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
    HELP_HELP="  help              — show this help"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
require_root() {
    if [[ $EUID -ne 0 ]]; then
        warn "$L_NOT_ROOT"
        exit 1
    fi
}

# Run log follow — Ctrl-C kills only the child, not the script
run_logs() {
    trap '' INT
    $DC logs -f --tail=200 "$@" || true
    trap - INT
}

cmd_status() {
    section "$L_STATUS"
    $DC ps
}

cmd_logs() {
    local svc="${1:-}"
    if [[ -n "$svc" ]]; then
        section "${L_LOGS_SVC}: ${svc}"
        run_logs "$svc"
    else
        section "$L_LOGS_ALL"
        run_logs
    fi
}

cmd_restart() {
    require_root
    local svc="${1:-}"
    if [[ -n "$svc" ]]; then
        section "${L_RESTART_SVC}: ${svc}"
        $DC restart "$svc"
    else
        section "$L_RESTART_ALL"
        $DC restart
    fi
    $DC ps
}

cmd_start() {
    require_root
    section "$L_START"
    $DC up -d
    $DC ps
}

cmd_stop() {
    require_root
    section "$L_STOP"
    $DC stop
    $DC ps
}

cmd_update() {
    require_root
    section "$L_UPDATE"
    info "$L_UPDATE_PULL"
    git -C "$INSTALL_DIR" pull --ff-only
    info "$L_UPDATE_BUILD"
    $DC up -d --build --remove-orphans
    info "$L_UPDATE_DONE"
    $DC ps
}

cmd_config() {
    local env_file="${INSTALL_DIR}/.env"
    [[ -f "$env_file" ]] || error "${L_CONFIG_HINT}: ${env_file} not found"
    info "${L_CONFIG_HINT}: ${env_file}"
    "${EDITOR:-nano}" "$env_file"
}

show_help() {
    echo -e "${BOLD}${HELP_TITLE}${NC}"
    echo
    echo -e "${HELP_CMDS}"
    echo -e "${HELP_MENU}"
    echo -e "${HELP_STATUS}"
    echo -e "${HELP_LOGS}"
    echo -e "${HELP_RESTART}"
    echo -e "${HELP_START}"
    echo -e "${HELP_STOP}"
    echo -e "${HELP_UPDATE}"
    echo -e "${HELP_CONFIG}"
    echo -e "${HELP_HELP}"
    echo
}

# ── Interactive menu ──────────────────────────────────────────────────────────
show_menu() {
    echo
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║   ${BOLD}${L_MENU_TITLE}${NC}${GREEN}   ║${NC}"
    echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║${NC}  ${YELLOW}1)${NC} ${M1}"
    echo -e "${GREEN}║${NC}  ${YELLOW}2)${NC} ${M2}"
    echo -e "${GREEN}║${NC}  ${YELLOW}3)${NC} ${M3}"
    echo -e "${GREEN}║${NC}  ${YELLOW}4)${NC} ${M4}"
    echo -e "${GREEN}║${NC}  ${YELLOW}5)${NC} ${M5}"
    echo -e "${GREEN}║${NC}  ${YELLOW}6)${NC} ${M6}"
    echo -e "${GREEN}║${NC}  ${YELLOW}7)${NC} ${M7}"
    echo -e "${GREEN}║${NC}  ${YELLOW}8)${NC} ${M8}"
    echo -e "${GREEN}║${NC}  ${YELLOW}0)${NC} ${M0}"
    echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${GREEN}║${NC}  ${YELLOW}ℹ${NC}  ${L_HINT}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
    echo
    echo -ne "  ${MP} [0-8]: "
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
            0) echo -e "${GREEN}${L_EXIT}${NC}"; break ;;
            *) warn "$L_INVALID" ;;
        esac
    done
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
CMD="${1:-}"
shift || true

case "$CMD" in
    "")           run_menu            ;;
    status)       cmd_status          ;;
    logs)         cmd_logs "$@"       ;;
    restart)      cmd_restart "$@"    ;;
    start)        cmd_start           ;;
    stop)         cmd_stop            ;;
    update)       cmd_update          ;;
    config)       cmd_config          ;;
    help|--help|-h) show_help         ;;
    *)
        warn "Unknown command: ${CMD}"
        echo
        show_help
        exit 1
        ;;
esac
