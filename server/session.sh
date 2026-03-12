#!/usr/bin/env bash
# VPS Session Manager -- manages tmux-backed persistent sessions for pair programming
# All developers share the same tmux sessions via the shared 'dev' user.
# Usage: session.sh <command> [args...]
# Commands: start, end, list, describe, reconcile, registry
# Developer identity: pass dev name as last arg to 'start' to source ~/.vps/developers/<name>.env

set -euo pipefail

HOME_DIR="$HOME"
REPO_DIR="$HOME/nextpay"
REGISTRY="$HOME/.vps/sessions.yaml"
TMUX_CONF="$HOME/.vps/tmux.conf"
DEVELOPERS_DIR="$HOME/.vps/developers"
PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.volta/bin:$PATH"

# Ensure registry exists
if [[ ! -f "$REGISTRY" ]]; then
  mkdir -p "$(dirname "$REGISTRY")"
  printf '# VPS session registry -- managed by .vps/session.sh\nsessions: []\n' > "$REGISTRY"
fi

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

tmux_running() {
  tmux -f "$TMUX_CONF" has-session -t "$1" 2>/dev/null
}

registry_add() {
  local name="$1" type="$2" desc="$3" ts
  ts="$(timestamp)"
  sed -i 's/^sessions: \[\]$/sessions:/' "$REGISTRY"
  cat >> "$REGISTRY" <<EOF
  - name: $name
    type: $type
    description: "$desc"
    status: active
    created_at: "$ts"
    ended_at: null
EOF
}

registry_end() {
  local name="$1" ts
  ts="$(timestamp)"
  awk -v name="$name" -v ts="$ts" '
    BEGIN { last_line = 0 }
    /^  - name: / { current_name = $3 }
    /status: active/ && current_name == name { last_line = NR }
    { lines[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (i == last_line) {
          sub(/status: active/, "status: ended", lines[i])
          print lines[i]
          getline_next = i + 1
          if (lines[getline_next] ~ /ended_at: null/) {
            lines[getline_next] = "    ended_at: \"" ts "\""
          }
        } else {
          print lines[i]
        }
      }
    }
  ' "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
}

registry_describe() {
  local name="$1" desc="$2"
  awk -v name="$name" -v desc="$desc" '
    /^  - name: / { current_name = $3; current_active = 0 }
    current_name == name && /status: active/ { current_active = 1 }
    current_name == name && current_active && /description:/ { target = NR }
    { lines[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (i == target) {
          print "    description: \"" desc "\""
        } else {
          print lines[i]
        }
      }
    }
  ' "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
}

has_active_entry() {
  local name="$1"
  grep -A3 "name: $name$" "$REGISTRY" | grep -q "status: active"
}

cmd_start() {
  local name="$1" type="${2:-shell}" desc="${3:-}" dev_user="${4:-}"

  # If tmux session already exists, just attach (pair programming!)
  if tmux_running "$name"; then
    exec tmux -f "$TMUX_CONF" attach-session -t "$name"
  fi

  # Prompt for description if not provided and interactive
  if [[ -z "$desc" ]] && [[ -t 0 ]]; then
    printf "Session description for '%s': " "$name"
    read -r desc
  fi
  [[ -z "$desc" ]] && desc="(no description)"

  # Reconcile stale sessions first
  cmd_reconcile quiet

  # Add registry entry
  registry_add "$name" "$type" "$desc"

  # Use REPO_DIR if it exists, otherwise home
  local work_dir="$HOME"
  [[ -d "$REPO_DIR" ]] && work_dir="$REPO_DIR"

  # Build env preamble (source developer identity if available)
  local env_preamble=""
  if [[ -n "$dev_user" ]] && [[ -f "$DEVELOPERS_DIR/${dev_user}.env" ]]; then
    env_preamble="source $DEVELOPERS_DIR/${dev_user}.env && git config --global user.name \"\$GIT_AUTHOR_NAME\" && git config --global user.email \"\$GIT_AUTHOR_EMAIL\" && "
  fi

  # Build the command for the tmux session
  local cmd
  case "$type" in
    shell)
      cmd="${env_preamble}cd $work_dir && exec \$SHELL -l"
      ;;
    claude)
      cmd="${env_preamble}cd $work_dir && claude --dangerously-skip-permissions"
      ;;
    codex)
      cmd="${env_preamble}cd $work_dir && codex --dangerously-bypass-approvals-and-sandbox"
      ;;
    *)
      echo "Unknown type: $type" >&2
      exit 1
      ;;
  esac

  # Create and attach
  tmux -f "$TMUX_CONF" new-session -d -s "$name" "$cmd"
  exec tmux -f "$TMUX_CONF" attach-session -t "$name"
}

cmd_end() {
  local name="$1"
  if tmux_running "$name"; then
    tmux -f "$TMUX_CONF" kill-session -t "$name"
  fi
  if has_active_entry "$name"; then
    registry_end "$name"
    echo "Session '$name' ended."
  else
    echo "No active registry entry for '$name'."
  fi
}

cmd_list() {
  echo "=== Active tmux sessions ==="
  tmux -f "$TMUX_CONF" ls 2>/dev/null || echo "(none)"
  echo ""
  echo "=== Session registry ==="
  awk '
    /^  - name:/ { printf "\n" }
    /name:/ && !/^#/ && !/sessions:/ { printf "  %-20s", $3 }
    /type:/ { printf "%-10s", $2 }
    /description:/ {
      sub(/^[[:space:]]*description: "?/, ""); sub(/"$/, "")
      printf "%-40s", $0
    }
    /status:/ { printf "%-10s", $2 }
    /created_at:/ { sub(/^[[:space:]]*created_at: "?/, ""); sub(/"$/, ""); printf "%s", $0 }
    /ended_at:/ && !/null/ { sub(/^[[:space:]]*ended_at: "?/, ""); sub(/"$/, ""); printf " -> %s", $0 }
    /ended_at: null/ { }
  ' "$REGISTRY"
  echo ""
}

cmd_reconcile() {
  local quiet="${1:-}"
  local changed=0
  local active_names
  active_names=$(awk '
    /^  - name:/ { name = $3 }
    /status: active/ { print name }
  ' "$REGISTRY" | sort -u)

  local sname
  for sname in $active_names; do
    if ! tmux_running "$sname"; then
      registry_end "$sname"
      changed=1
      [[ "$quiet" != "quiet" ]] && echo "Reconciled stale session: $sname" || true
    fi
  done

  if [[ "$quiet" != "quiet" ]] && [[ $changed -eq 0 ]]; then
    echo "All sessions in sync."
  fi
  return 0
}

cmd_describe() {
  local name="$1" desc="$2"
  if has_active_entry "$name"; then
    registry_describe "$name" "$desc"
    echo "Updated description for '$name'."
  else
    echo "No active session '$name' found."
  fi
}

cmd_registry() {
  cat "$REGISTRY"
}

# Main dispatch
case "${1:-}" in
  start)    shift; [[ $# -lt 1 ]] && { echo "Usage: session.sh start <name> <type> [description]" >&2; exit 1; }; cmd_start "$@" ;;
  end)      shift; [[ $# -lt 1 ]] && { echo "Usage: session.sh end <name>" >&2; exit 1; }; cmd_end "$1" ;;
  list)     cmd_list ;;
  describe) shift; [[ $# -lt 2 ]] && { echo "Usage: session.sh describe <name> <desc>" >&2; exit 1; }; cmd_describe "$1" "$2" ;;
  reconcile) cmd_reconcile ;;
  registry) cmd_registry ;;
  *)        echo "Usage: session.sh {start|end|list|describe|reconcile|registry} [args...]" >&2; exit 1 ;;
esac
