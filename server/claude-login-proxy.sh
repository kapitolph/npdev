#!/usr/bin/env bash
# Claude Login Proxy — manages `claude auth login` with a PTY via pexpect
# so that a TUI can display the URL and accept the auth code separately.
#
# claude auth login requires a TTY to show the code prompt. This script
# uses python3 pexpect to provide a pseudo-terminal, captures the URL,
# and feeds the auth code when submitted.
#
# Usage:
#   claude-login-proxy.sh start [email]    → start login, returns JSON
#   claude-login-proxy.sh status           → check progress, returns JSON
#   claude-login-proxy.sh submit <code>    → feed auth code to process
#   claude-login-proxy.sh cancel           → kill and cleanup

set -euo pipefail

SESS_DIR="/tmp/ccp-login"

case "${1:-}" in
  start)
    EMAIL="${2:-}"

    # Clean any previous session
    if [ -d "$SESS_DIR" ]; then
      OLD_PID=$(cat "$SESS_DIR/worker_pid" 2>/dev/null || echo "")
      [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null || true
      # Also kill any python workers
      pkill -f "claude-login-worker.py" 2>/dev/null || true
      sleep 0.2
      rm -rf "$SESS_DIR"
    fi
    mkdir -p "$SESS_DIR"

    # Launch the pexpect worker in background
    python3 "$(dirname "$0")/claude-login-worker.py" "$SESS_DIR" "$EMAIL" &
    WORKER_PID=$!
    echo "$WORKER_PID" > "$SESS_DIR/worker_pid"

    # Give the worker a moment to start
    sleep 0.5

    echo "{\"ok\":true,\"action\":\"started\",\"pid\":$WORKER_PID}"
    ;;

  status)
    if [ ! -d "$SESS_DIR" ]; then
      echo '{"ok":false,"error":"no session"}'
      exit 0
    fi

    WORKER_PID=$(cat "$SESS_DIR/worker_pid" 2>/dev/null || echo "")
    WORKER_STATUS=$(cat "$SESS_DIR/worker_status" 2>/dev/null || echo "")
    URL=$(cat "$SESS_DIR/url.txt" 2>/dev/null || echo "")
    OUTPUT=$(cat "$SESS_DIR/output.log" 2>/dev/null || echo "")

    # Check if worker finished (either status file or process gone)
    if [ "$WORKER_STATUS" = "done" ] || [ "$WORKER_STATUS" = "error" ] || \
       { [ -n "$WORKER_PID" ] && ! kill -0 "$WORKER_PID" 2>/dev/null; }; then
      ESCAPED_OUTPUT=$(echo "$OUTPUT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')
      echo "{\"ok\":true,\"phase\":\"done\",\"output\":$ESCAPED_OUTPUT}"
    elif [ -n "$URL" ]; then
      ESCAPED_URL=$(echo "$URL" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))' 2>/dev/null || echo '""')
      echo "{\"ok\":true,\"phase\":\"has-url\",\"url\":$ESCAPED_URL}"
    else
      echo '{"ok":true,"phase":"starting"}'
    fi
    ;;

  submit)
    CODE="${2:-}"
    if [ ! -d "$SESS_DIR" ]; then
      echo '{"ok":false,"error":"no session"}'
      exit 0
    fi
    if [ -z "$CODE" ]; then
      echo '{"ok":false,"error":"no code provided"}'
      exit 0
    fi

    # Write the code — the pexpect worker polls for this file
    printf '%s' "$CODE" > "$SESS_DIR/code.txt"
    echo '{"ok":true,"action":"submitted"}'
    ;;

  cancel)
    if [ -d "$SESS_DIR" ]; then
      WORKER_PID=$(cat "$SESS_DIR/worker_pid" 2>/dev/null || echo "")
      [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
      pkill -f "claude-login-worker.py" 2>/dev/null || true
      rm -rf "$SESS_DIR"
    fi
    echo '{"ok":true,"action":"cancelled"}'
    ;;

  *)
    echo '{"ok":false,"error":"usage: claude-login-proxy.sh {start|status|submit|cancel} [args]"}'
    exit 1
    ;;
esac
