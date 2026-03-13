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
  local name="$1" type="$2" desc="$3" owner="${4:-unknown}" ts
  ts="$(timestamp)"
  sed -i 's/^sessions: \[\]$/sessions:/' "$REGISTRY"
  cat >> "$REGISTRY" <<EOF
  - name: $name
    type: $type
    description: "$desc"
    owner: $owner
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
    if [[ -n "${TMUX:-}" ]]; then
      tmux -f "$TMUX_CONF" switch-client -t "$name"
    else
      exec tmux -f "$TMUX_CONF" attach-session -t "$name"
    fi
    return 0
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
  registry_add "$name" "$type" "$desc" "$dev_user"

  # Use REPO_DIR if it exists, otherwise home
  local work_dir="$HOME"
  [[ -d "$REPO_DIR" ]] && work_dir="$REPO_DIR"

  # Build env preamble (source developer identity if available)
  # Uses a per-session gitconfig file so concurrent sessions don't overwrite each other
  local env_preamble=""
  if [[ -n "$dev_user" ]] && [[ -f "$DEVELOPERS_DIR/${dev_user}.env" ]]; then
    local session_gitconfig="$HOME/.vps/developers/${dev_user}.gitconfig"
    printf '[user]\n\tname = %s\n\temail = %s\n' \
      "$(grep GIT_AUTHOR_NAME "$DEVELOPERS_DIR/${dev_user}.env" | cut -d'"' -f2)" \
      "$(grep GIT_AUTHOR_EMAIL "$DEVELOPERS_DIR/${dev_user}.env" | cut -d'"' -f2)" \
      > "$session_gitconfig"
    # Include shared gitconfig (credential helper etc) if it exists
    if [[ -f "$HOME/.gitconfig" ]]; then
      printf '[include]\n\tpath = %s\n' "$HOME/.gitconfig" >> "$session_gitconfig"
    fi
    env_preamble="source $DEVELOPERS_DIR/${dev_user}.env && export GIT_CONFIG_GLOBAL=$session_gitconfig && "
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
  if [[ -n "${TMUX:-}" ]]; then
    tmux -f "$TMUX_CONF" switch-client -t "$name"
  else
    exec tmux -f "$TMUX_CONF" attach-session -t "$name"
  fi
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

  # Backfill missing owner fields (entries created before owner was added)
  # Inserts "owner: unknown" before status lines not preceded by owner lines
  awk '
    /status:/ && prev !~ /owner:/ { print "    owner: unknown" }
    { prev = $0; print }
  ' "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"

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
    else
      # Recover owner from running session's process environment if registry has "unknown"
      local current_owner
      current_owner=$(awk -v name="$sname" '
        /^  - name:/ { n = $3 }
        n == name && /owner:/ { print $2; exit }
      ' "$REGISTRY")
      if [[ "$current_owner" == "unknown" ]]; then
        local pid child target real_owner=""
        pid=$(tmux -f "$TMUX_CONF" list-panes -t "$sname" -F '#{pane_pid}' 2>/dev/null | head -1) || true
        if [[ -n "$pid" ]]; then
          child=$(pgrep -P "$pid" 2>/dev/null | head -1) || true
          target=${child:-$pid}
          real_owner=$(tr '\0' '\n' < /proc/"$target"/environ 2>/dev/null | sed -n 's/^GIT_AUTHOR_NAME=//p' | head -1) || true
        fi
        if [[ -n "$real_owner" ]]; then
          # Lowercase the owner name to match npdev user convention
          real_owner=$(echo "$real_owner" | tr '[:upper:]' '[:lower:]')
          awk -v name="$sname" -v owner="$real_owner" '
            /^  - name:/ { current = $3 }
            current == name && /owner: unknown/ { sub(/owner: unknown/, "owner: " owner) }
            { print }
          ' "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
          changed=1
          [[ "$quiet" != "quiet" ]] && echo "Recovered owner for '$sname': $real_owner" || true
        fi
      fi
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

cmd_session_data() {
  # Output JSON combining registry data + tmux session_activity timestamps
  # Single awk pass: collect all fields per block, emit active entries
  # Format: name|type|description|owner|created_at (one per line)
  local entries
  entries=$(awk '
    /^  - name:/ {
      if (status == "active" && name != "") print name "|" type "|" desc "|" owner "|" created
      name = $3; type = ""; desc = ""; owner = "unknown"; created = ""; status = ""
    }
    !/^  - name:/ && /type:/ { type = $2 }
    /description:/ {
      d = $0; sub(/^[[:space:]]*description:[[:space:]]*"?/, "", d); sub(/"$/, "", d); desc = d
    }
    /owner:/ { owner = $2 }
    /status:/ { status = $2 }
    /created_at:/ {
      c = $0; sub(/^[[:space:]]*created_at:[[:space:]]*"?/, "", c); sub(/"$/, "", c); created = c
    }
    END {
      if (status == "active" && name != "") print name "|" type "|" desc "|" owner "|" created
    }
  ' "$REGISTRY" | sort -u -t'|' -k1,1)

  local first=1
  printf '['
  while IFS='|' read -r sname stype sdesc sowner screated; do
    [[ -z "$sname" ]] && continue
    # Skip sessions that no longer have a tmux process
    tmux_running "$sname" || continue

    local last_activity
    last_activity=$(tmux -f "$TMUX_CONF" display-message -p -t "$sname" '#{session_activity}' 2>/dev/null || echo "")
    local client_count
    client_count=$(tmux -f "$TMUX_CONF" display-message -p -t "$sname" '#{session_attached}' 2>/dev/null || echo "0")

    # Escape JSON-unsafe characters in description
    local safe_desc
    safe_desc=$(printf '%s' "$sdesc" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\000-\037')

    [[ $first -eq 0 ]] && printf ','
    first=0
    printf '{"name":"%s","type":"%s","description":"%s","owner":"%s","created_at":"%s","last_activity":"%s","client_count":"%s"}' \
      "$sname" "$stype" "$safe_desc" "$sowner" "$screated" "$last_activity" "$client_count"
  done <<< "$entries"
  printf ']\n'
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
  session-data) cmd_session_data ;;
  registry) cmd_registry ;;
  *)        echo "Usage: session.sh {start|end|list|describe|reconcile|session-data|registry} [args...]" >&2; exit 1 ;;
esac
