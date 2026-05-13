#!/usr/bin/env bash
#
# trail-server コントロールスクリプト (WSL 向け)
#
# 使い方:
#   trail-server.sh start    foreground 起動 (Ctrl+C で停止)
#   trail-server.sh up       background 起動 (nohup + disown)
#   trail-server.sh status   起動状態確認
#   trail-server.sh stop     graceful 停止
#   trail-server.sh restart  up → status の組合せ
#   trail-server.sh open     daemon URL をブラウザで開く
#   trail-server.sh logs     当日ログを tail -f
#   trail-server.sh init     ~/.claude/trail/config.json の雛形を生成
#
# 環境変数:
#   TRAIL_HOME              既定 ~/.claude/trail
#   TRAIL_PORT              既定 0 (OS 任せ)
#   TRAIL_NO_SCHEDULER      "1" で --no-scheduler 付与
#   TRAIL_SERVER_CLI        cli.js のパスを上書き

set -euo pipefail

# ---------------------------------------------------------------------------
# 設定の解決
# ---------------------------------------------------------------------------

# このスクリプト自身の位置から trail-server パッケージを特定する。
# /anytime-markdown/packages/trail-server/scripts/trail-server.sh を想定。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_CLI="${PKG_DIR}/dist/cli.js"
CLI_PATH="${TRAIL_SERVER_CLI:-${DEFAULT_CLI}}"
TRAIL_HOME="${TRAIL_HOME:-${HOME}/.claude/trail}"
DAEMON_JSON="${TRAIL_HOME}/daemon.json"
LOG_DIR="${TRAIL_HOME}/logs"
PORT="${TRAIL_PORT:-0}"

# Node コマンド (nvm 経由でも対応)
NODE_BIN="$(command -v node || true)"
if [ -z "${NODE_BIN}" ]; then
  echo "ERROR: node が PATH にない。nvm 利用時は 'nvm use' してから実行する" >&2
  exit 2
fi

ensure_cli() {
  if [ ! -f "${CLI_PATH}" ]; then
    echo "ERROR: cli.js が見つからない: ${CLI_PATH}" >&2
    echo "       cd ${PKG_DIR%/packages/*} && npm run build --workspace=@anytime-markdown/trail-server" >&2
    exit 2
  fi
}

read_pid() {
  if [ ! -f "${DAEMON_JSON}" ]; then
    return 1
  fi
  # python3 を使うと jq 非依存
  PID=$("${NODE_BIN}" -e "try{const o=require('${DAEMON_JSON}');process.stdout.write(String(o.pid||''));}catch{}")
  [ -n "${PID}" ]
}

read_url() {
  if [ ! -f "${DAEMON_JSON}" ]; then
    return 1
  fi
  URL=$("${NODE_BIN}" -e "try{const o=require('${DAEMON_JSON}');process.stdout.write(o.url||'');}catch{}")
  [ -n "${URL}" ]
}

is_alive() {
  read_pid || return 1
  kill -0 "${PID}" 2>/dev/null
}

# ---------------------------------------------------------------------------
# サブコマンド
# ---------------------------------------------------------------------------

cmd_start() {
  ensure_cli
  if is_alive; then
    read_url
    echo "Already running: ${URL} (pid=${PID})"
    return 0
  fi
  local extra=()
  if [ "${TRAIL_NO_SCHEDULER:-}" = "1" ]; then
    extra+=(--no-scheduler)
  fi
  echo "Starting (foreground) on TRAIL_HOME=${TRAIL_HOME}, port=${PORT}"
  exec env TRAIL_HOME="${TRAIL_HOME}" "${NODE_BIN}" "${CLI_PATH}" start --port "${PORT}" "${extra[@]}"
}

cmd_up() {
  ensure_cli
  if is_alive; then
    read_url
    echo "Already running: ${URL} (pid=${PID})"
    return 0
  fi
  mkdir -p "${LOG_DIR}"
  local extra=()
  if [ "${TRAIL_NO_SCHEDULER:-}" = "1" ]; then
    extra+=(--no-scheduler)
  fi
  echo "Starting (background) on TRAIL_HOME=${TRAIL_HOME}, port=${PORT}"
  # 親 shell のジョブテーブルから外す (disown 相当)
  TRAIL_HOME="${TRAIL_HOME}" nohup "${NODE_BIN}" "${CLI_PATH}" start --port "${PORT}" "${extra[@]}" \
    > "${LOG_DIR}/launcher-$(date +%Y-%m-%d).log" 2>&1 &
  disown
  # daemon.json の生成を最大 10 秒待つ
  for i in $(seq 1 50); do
    sleep 0.2
    if is_alive && read_url; then
      echo "Started: ${URL} (pid=${PID})"
      return 0
    fi
  done
  echo "ERROR: daemon.json が 10 秒以内に生成されなかった。ログを確認: ${LOG_DIR}/launcher-*.log" >&2
  return 1
}

cmd_status() {
  if is_alive; then
    read_url
    echo "Running: ${URL} (pid=${PID})"
    return 0
  fi
  if [ -f "${DAEMON_JSON}" ]; then
    echo "Stale daemon.json (pid not alive)"
    return 1
  fi
  echo "Not running"
  return 1
}

cmd_stop() {
  ensure_cli
  if ! is_alive; then
    echo "Not running"
    return 1
  fi
  echo "Stopping pid=${PID}..."
  kill -TERM "${PID}"
  # 最大 30 秒待つ
  for i in $(seq 1 150); do
    sleep 0.2
    if ! kill -0 "${PID}" 2>/dev/null; then
      echo "Stopped."
      return 0
    fi
  done
  echo "WARNING: 30 秒以内に停止しなかった。SIGKILL を送信する場合は手動で 'kill -9 ${PID}'" >&2
  return 1
}

cmd_restart() {
  cmd_stop || true
  sleep 1
  cmd_up
}

cmd_open() {
  if ! is_alive; then
    echo "Not running. trail-server.sh up で起動してください" >&2
    return 1
  fi
  read_url
  # WSL の場合 powershell 経由で Windows 側のブラウザを開く
  if grep -qi microsoft /proc/version 2>/dev/null; then
    powershell.exe Start-Process "${URL}" 2>/dev/null || xdg-open "${URL}" 2>/dev/null || echo "Open this URL: ${URL}"
  else
    xdg-open "${URL}" 2>/dev/null || open "${URL}" 2>/dev/null || echo "Open this URL: ${URL}"
  fi
}

cmd_logs() {
  local today
  today=$(date +%Y-%m-%d)
  local log_file="${LOG_DIR}/daemon-${today}.log"
  if [ ! -f "${log_file}" ]; then
    echo "Log file not found yet: ${log_file}" >&2
    echo "起動後に再度試してください" >&2
    return 1
  fi
  exec tail -f "${log_file}"
}

cmd_init() {
  local config="${TRAIL_HOME}/config.json"
  if [ -f "${config}" ]; then
    echo "Already exists: ${config}" >&2
    return 1
  fi
  mkdir -p "${TRAIL_HOME}"
  cat > "${config}" <<'EOF'
{
  "schemaVersion": 1,
  "gitRoots": [
    "/anytime-markdown",
    "/Shared/anytime-markdown-docs"
  ],
  "scheduler": {
    "periodicImport": {
      "intervalSec": 60,
      "runOnStart": true,
      "startupDelaySec": 10
    }
  }
}
EOF
  echo "Created: ${config}"
  echo "編集してから 'trail-server.sh up' で起動してください"
}

cmd_help() {
  sed -n '3,18p' "${BASH_SOURCE[0]}"
}

# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

case "${1:-help}" in
  start)   cmd_start ;;
  up)      cmd_up ;;
  status)  cmd_status ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  open)    cmd_open ;;
  logs)    cmd_logs ;;
  init)    cmd_init ;;
  help|-h|--help) cmd_help ;;
  *)
    echo "Unknown command: $1" >&2
    cmd_help
    exit 2
    ;;
esac
