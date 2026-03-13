#!/usr/bin/env bash
# Tmux hook — notify session when a developer attaches/detaches.
# Args: $1 = attached|detached, $2 = client PID, $3 = session name

EVENT="$1"
CLIENT_PID="$2"
SESSION_NAME="$3"

[[ -z "$SESSION_NAME" ]] && exit 0

# Walk the process tree to find the developer's identity
find_developer() {
  local pid="$1"
  while [[ -n "$pid" ]] && [[ "$pid" != "0" ]] && [[ "$pid" != "1" ]]; do
    if [[ -r "/proc/$pid/environ" ]]; then
      local name
      name=$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^GIT_AUTHOR_NAME=//p' | head -1) || true
      if [[ -n "$name" ]]; then
        echo "$name"
        return 0
      fi
    fi
    # Walk up to parent
    pid=$(awk '/^PPid:/ { print $2 }' "/proc/$pid/status" 2>/dev/null) || break
  done
  return 1
}

DEV_NAME=$(find_developer "$CLIENT_PID") || DEV_NAME="someone"

tmux display-message -d 3000 -t "$SESSION_NAME" "$DEV_NAME $EVENT" 2>/dev/null || true
