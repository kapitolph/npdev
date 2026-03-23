#!/usr/bin/env bash
# Codex CLI Profile Switcher -- save/restore per-developer Codex OAuth credentials
# Usage: cxp <command> [args...]
# Commands: list, use/switch, next, login, logout, save, whoami, help
# Short alias: cxp ("codex profile")

set -euo pipefail

DEVELOPERS_DIR="${DEVELOPERS_DIR:-$HOME/.vps/developers}"
AUTH_FILE="${CODEX_AUTH_FILE:-${CODEX_HOME:-$HOME/.codex}/auth.json}"
CONFIG_FILE="${CODEX_HOME:-$HOME/.codex}/config.toml"
REGISTRY="${REGISTRY:-$HOME/.vps/sessions.yaml}"
ACTIVE_PROFILE_FILE="${ACTIVE_PROFILE_FILE:-$HOME/.codex/.active-profile}"
STALE_DAYS=8

# ─── JSON mode ────────────────────────────────────────────────────────────────
JSON_MODE=false
args=()
for arg in "$@"; do
  [[ "$arg" == "--json" ]] && JSON_MODE=true || args+=("$arg")
done
set -- "${args[@]+"${args[@]}"}"

die() {
  if $JSON_MODE; then
    jq -n --arg err "$*" '{"ok":false,"error":$err}'
  else
    echo "ERROR: $*" >&2
  fi
  exit 1
}
warn() { echo "WARNING: $*" >&2; }

# Get sorted list of developer names that have saved Codex credentials
get_credentialed_profiles() {
  for env_file in "$DEVELOPERS_DIR"/*.env; do
    local name
    name=$(basename "$env_file" .env)
    if [[ -f "$DEVELOPERS_DIR/${name}.codex-auth.json" ]]; then
      echo "$name"
    fi
  done | sort
}

# Validate that a developer is registered (has a .env file)
validate_dev() {
  local name="$1"
  [[ -f "$DEVELOPERS_DIR/${name}.env" ]] || die "Developer '$name' is not registered (no $DEVELOPERS_DIR/${name}.env)"
}

# Get email from developer's .env file
dev_email() {
  local name="$1"
  grep GIT_AUTHOR_EMAIL "$DEVELOPERS_DIR/${name}.env" 2>/dev/null | cut -d'"' -f2 || true
}

# Get the currently active profile name from state file
current_profile() {
  if [[ -f "$ACTIVE_PROFILE_FILE" ]]; then
    local name
    name=$(<"$ACTIVE_PROFILE_FILE")
    # Validate the profile still exists
    if [[ -n "$name" && -f "$DEVELOPERS_DIR/${name}.env" ]]; then
      echo "$name"
    fi
  fi
  return 0
}

# Set the active profile
set_active_profile() {
  local name="$1"
  mkdir -p "$(dirname "$ACTIVE_PROFILE_FILE")"
  printf '%s' "$name" > "$ACTIVE_PROFILE_FILE"
}

# Auto-save current live auth.json back to the active profile before switching.
# This captures any auto-refreshed tokens that Codex CLI updated silently.
auto_save_current() {
  [[ -f "$AUTH_FILE" ]] || return 0

  local current
  current=$(current_profile)
  [[ -z "$current" ]] && return 0

  # Silently update the saved credentials with the live (possibly refreshed) ones
  cp "$AUTH_FILE" "$DEVELOPERS_DIR/${current}.codex-auth.json"
  chmod 600 "$DEVELOPERS_DIR/${current}.codex-auth.json"
}

# Check token staleness. Returns: "valid (Xd)", "stale", or "unknown"
# Codex uses .last_refresh (ISO 8601) + 8-day window
token_status() {
  local creds_file="$1"
  [[ -f "$creds_file" ]] || { echo "no credentials"; return; }

  local last_refresh
  last_refresh=$(jq -r '.last_refresh // empty' "$creds_file" 2>/dev/null) || { echo "unknown"; return; }
  [[ -z "$last_refresh" ]] && { echo "unknown"; return; }

  local refresh_epoch now_epoch
  refresh_epoch=$(date -d "$last_refresh" +%s 2>/dev/null) || { echo "unknown"; return; }
  now_epoch=$(date +%s)

  local age_s=$(( now_epoch - refresh_epoch ))
  local stale_s=$(( STALE_DAYS * 86400 ))

  if (( age_s < stale_s )); then
    local remaining_s=$(( stale_s - age_s ))
    local days=$(( remaining_s / 86400 ))
    local hours=$(( (remaining_s % 86400) / 3600 ))
    if (( days > 0 )); then
      echo "valid (${days}d)"
    else
      echo "valid (${hours}h)"
    fi
  else
    echo "stale"
  fi
}

# Check for active codex-type sessions that might be affected
check_active_sessions() {
  local switching_to="$1"
  [[ -f "$REGISTRY" ]] || return 0

  local current
  current=$(current_profile)
  [[ -z "$current" || "$current" == "$switching_to" ]] && return 0

  local active_codex_sessions
  active_codex_sessions=$(awk '
    /^  - name:/ { name = $3; type = ""; status = "" }
    /type:/ { type = $2 }
    /status: active/ { status = "active" }
    status == "active" && type == "codex" { print name; name=""; type=""; status="" }
  ' "$REGISTRY" 2>/dev/null)

  if [[ -n "$active_codex_sessions" ]]; then
    warn "Active Codex session(s) detected (currently profile '$current'):"
    echo "$active_codex_sessions" | while read -r s; do
      echo "  - $s" >&2
    done
    warn "Switching credentials may affect these sessions."
  fi
}

# Ensure config.toml has file-based credential storage (headless VPS has no keyring)
ensure_file_storage() {
  local config_dir
  config_dir=$(dirname "$CONFIG_FILE")
  mkdir -p "$config_dir"

  if [[ ! -f "$CONFIG_FILE" ]]; then
    printf 'cli_auth_credentials_store = "file"\n' > "$CONFIG_FILE"
    return
  fi

  if ! grep -q 'cli_auth_credentials_store' "$CONFIG_FILE" 2>/dev/null; then
    printf '\ncli_auth_credentials_store = "file"\n' >> "$CONFIG_FILE"
  fi
}

cmd_save() {
  local name="$1"
  local force="${2:-}"
  validate_dev "$name"

  local dest_auth="$DEVELOPERS_DIR/${name}.codex-auth.json"

  # Check if profile already exists
  if [[ -f "$dest_auth" ]] && [[ "$force" != "--force" ]]; then
    if $JSON_MODE; then
      die "Profile for '$name' already exists. Use --force to overwrite."
    fi
    warn "Profile for '$name' already exists. Use --force to overwrite."
    return 1
  fi

  # Validate source file exists
  [[ -f "$AUTH_FILE" ]] || die "No auth file found at $AUTH_FILE"

  # Validate JSON before writing
  jq empty "$AUTH_FILE" 2>/dev/null || die "Invalid JSON in $AUTH_FILE"

  # Copy auth file
  cp "$AUTH_FILE" "$dest_auth"
  chmod 600 "$dest_auth"

  local account_id
  account_id=$(jq -r '.tokens.account_id // "unknown"' "$dest_auth" 2>/dev/null)

  # Guard: reject if another profile already uses this account_id
  if [[ "$account_id" != "unknown" && "$account_id" != "null" ]]; then
    for env_file in "$DEVELOPERS_DIR"/*.env; do
      local other
      other=$(basename "$env_file" .env)
      [[ "$other" == "$name" ]] && continue
      local other_auth="$DEVELOPERS_DIR/${other}.codex-auth.json"
      [[ -f "$other_auth" ]] || continue
      local other_id
      other_id=$(jq -r '.tokens.account_id // empty' "$other_auth" 2>/dev/null) || true
      if [[ "$other_id" == "$account_id" ]]; then
        # Roll back written file
        rm -f "$dest_auth"
        die "Account ID '$account_id' is already saved under profile '$other'. Each profile must use a unique account."
      fi
    done
  fi

  local email
  email=$(dev_email "$name")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" --arg account_id "$account_id" \
      '{"ok":true,"action":"saved","profile":$profile,"email":$email,"account_id":$account_id}'
  else
    echo "Saved Codex profile for '$name' ($email)"
  fi
}

cmd_use() {
  local name="$1"
  validate_dev "$name"

  local src_auth="$DEVELOPERS_DIR/${name}.codex-auth.json"

  [[ -f "$src_auth" ]] || die "No saved credentials for '$name'. Run: cxp login $name"

  # Warn about active sessions
  check_active_sessions "$name"

  # Auto-save current profile's credentials before overwriting (captures refreshed tokens)
  auto_save_current

  # Check token staleness and warn
  local status
  status=$(token_status "$src_auth")
  if [[ "$status" == "stale" ]]; then
    warn "Token for '$name' is stale (>${STALE_DAYS}d since last refresh). You may need to re-login."
  fi

  # Restore auth file
  local auth_dir
  auth_dir=$(dirname "$AUTH_FILE")
  mkdir -p "$auth_dir"
  cp "$src_auth" "$AUTH_FILE"
  chmod 600 "$AUTH_FILE"

  # Track active profile
  set_active_profile "$name"

  local email
  email=$(dev_email "$name")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" --arg token_status "$status" \
      '{"ok":true,"action":"switched","profile":$profile,"email":$email,"token_status":$token_status}'
  else
    echo "Switched to Codex profile '$name' (${email:-unknown})"
  fi
}

cmd_login() {
  local name="$1"
  validate_dev "$name"

  local email
  email=$(dev_email "$name")

  # Ensure file-based credential storage (headless VPS)
  ensure_file_storage

  echo ""
  echo "Login for Codex profile: $name ($email)"
  echo ""
  echo "Running: codex login --device-auth"
  echo ""

  # Run codex login with device auth (headless VPS)
  codex login --device-auth

  # Verify auth file was created
  if [[ ! -f "$AUTH_FILE" ]]; then
    die "Login completed but no auth file found at $AUTH_FILE"
  fi

  # Save for this profile (force overwrite)
  cmd_save "$name" "--force"
  set_active_profile "$name"

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" \
      '{"ok":true,"action":"login","profile":$profile,"email":$email}'
  else
    echo "Logged in and saved Codex profile for '$name' ($email)"
  fi
}

cmd_logout() {
  local name="${1:-}"

  # If no name given, use active profile
  if [[ -z "$name" ]]; then
    name=$(current_profile)
    [[ -z "$name" ]] && die "No active profile. Specify a name: cxp logout <name>"
  fi

  validate_dev "$name"

  local auth_file="$DEVELOPERS_DIR/${name}.codex-auth.json"

  if [[ ! -f "$auth_file" ]]; then
    die "No saved credentials for '$name' — nothing to logout."
  fi

  rm -f "$auth_file"

  # If this was the active profile, clear the active state and live auth file
  local current
  current=$(current_profile)
  if [[ "$current" == "$name" ]]; then
    rm -f "$ACTIVE_PROFILE_FILE"
    rm -f "$AUTH_FILE"
  fi

  if $JSON_MODE; then
    jq -n --arg profile "$name" '{"ok":true,"action":"logout","profile":$profile}'
  else
    echo "Logged out '$name' — credentials removed."
  fi
}

cmd_next() {
  local -a profiles
  mapfile -t profiles < <(get_credentialed_profiles)
  local count=${#profiles[@]}

  if (( count == 0 )); then
    die "No saved profiles to cycle through."
  fi
  if (( count == 1 )); then
    if $JSON_MODE; then
      jq -n --arg profile "${profiles[0]}" \
        '{"ok":true,"action":"noop","profile":$profile,"message":"Only one saved profile — nothing to cycle to."}'
    else
      echo "Only one saved profile (${profiles[0]}) — nothing to cycle to."
    fi
    return
  fi

  local current
  current=$(current_profile)
  local next_idx=0

  if [[ -n "$current" ]]; then
    for i in "${!profiles[@]}"; do
      if [[ "${profiles[$i]}" == "$current" ]]; then
        next_idx=$(( (i + 1) % count ))
        break
      fi
    done
  fi

  cmd_use "${profiles[$next_idx]}"
}

cmd_list() {
  local current
  current=$(current_profile)

  if $JSON_MODE; then
    local json_profiles="[]"
    for env_file in "$DEVELOPERS_DIR"/*.env; do
      local name
      name=$(basename "$env_file" .env)
      local email
      email=$(dev_email "$name")

      local saved_auth="$DEVELOPERS_DIR/${name}.codex-auth.json"
      local has_creds=false
      local status="not saved"
      local plan_type=""
      local active=false
      if [[ -f "$saved_auth" ]]; then
        has_creds=true
        status=$(token_status "$saved_auth")
        plan_type=$(jq -r '.tokens.chatgpt_plan_type // ""' "$saved_auth" 2>/dev/null)
        [[ "$name" == "$current" ]] && active=true
      fi

      json_profiles=$(echo "$json_profiles" | jq \
        --arg name "$name" \
        --arg email "$email" \
        --argjson has_creds "$has_creds" \
        --arg token_status "$status" \
        --arg plan_type "$plan_type" \
        --argjson active "$active" \
        '. + [{"name":$name,"email":$email,"has_credentials":$has_creds,"token_status":$token_status,"plan_type":$plan_type,"active":$active}]')
    done

    jq -n --arg current "${current:-}" --argjson profiles "$json_profiles" \
      '{"ok":true,"current":$current,"profiles":$profiles}'
    return
  fi

  local num=0
  printf "%-10s %-3s %-35s %-15s %-12s %s\n" "PROFILE" "#" "EMAIL" "TOKEN" "PLAN" "ACTIVE"
  for env_file in "$DEVELOPERS_DIR"/*.env; do
    local name
    name=$(basename "$env_file" .env)
    local email
    email=$(dev_email "$name")

    local saved_auth="$DEVELOPERS_DIR/${name}.codex-auth.json"
    if [[ -f "$saved_auth" ]]; then
      num=$((num + 1))
      local status plan_type active
      status=$(token_status "$saved_auth")
      plan_type=$(jq -r '.tokens.chatgpt_plan_type // "-"' "$saved_auth" 2>/dev/null)
      active=""
      [[ "$name" == "$current" ]] && active="*"
      printf "%-10s %-3s %-35s %-15s %-12s %s\n" "$name" "$num" "$email" "$status" "$plan_type" "$active"
    else
      printf "%-10s %-3s %-35s %-15s %-12s %s\n" "$name" "-" "$email" "(not saved)" "-" ""
    fi
  done
}

cmd_whoami() {
  local current
  current=$(current_profile)

  if [[ -z "$current" ]]; then
    if $JSON_MODE; then
      if [[ -f "$AUTH_FILE" ]]; then
        local account_id
        account_id=$(jq -r '.tokens.account_id // "unknown"' "$AUTH_FILE" 2>/dev/null)
        jq -n --arg account_id "$account_id" \
          '{"ok":true,"profile":null,"account_id":$account_id,"message":"No matching saved profile for current credentials."}'
      else
        jq -n '{"ok":true,"profile":null,"message":"No credentials found."}'
      fi
    else
      echo "No matching saved profile for current credentials."
      if [[ -f "$AUTH_FILE" ]]; then
        local account_id plan_type
        account_id=$(jq -r '.tokens.account_id // "unknown"' "$AUTH_FILE" 2>/dev/null)
        plan_type=$(jq -r '.tokens.chatgpt_plan_type // "unknown"' "$AUTH_FILE" 2>/dev/null)
        echo "Current account: $account_id ($plan_type)"
        echo "Hint: run 'cxp save <name>' to save these credentials to a profile."
      fi
    fi
    return
  fi

  local email plan_type status
  email=$(dev_email "$current")
  plan_type="unknown"
  status="unknown"
  local saved_auth="$DEVELOPERS_DIR/${current}.codex-auth.json"
  [[ -f "$saved_auth" ]] && {
    plan_type=$(jq -r '.tokens.chatgpt_plan_type // "unknown"' "$saved_auth" 2>/dev/null)
    status=$(token_status "$saved_auth")
  }

  if $JSON_MODE; then
    jq -n --arg profile "$current" --arg email "$email" \
      --arg plan_type "$plan_type" --arg token_status "$status" \
      '{"ok":true,"profile":$profile,"email":$email,"plan_type":$plan_type,"token_status":$token_status}'
  else
    echo "Active profile: $current ($email) | ${plan_type:-unknown} | token ${status:-unknown}"
  fi
}

cmd_help() {
  if $JSON_MODE; then
    jq -n '{"ok":true,"commands":[
      {"name":"whoami","usage":"cxp","description":"Show current profile (default)"},
      {"name":"list","usage":"cxp list","description":"List all profiles with numbers"},
      {"name":"use","usage":"cxp use <name>","description":"Switch to a profile by name"},
      {"name":"next","usage":"cxp next","description":"Cycle to next saved profile"},
      {"name":"login","usage":"cxp login <name>","description":"Run codex login --device-auth and save credentials"},
      {"name":"save","usage":"cxp save <name>","description":"Save current credentials to a profile"},
      {"name":"logout","usage":"cxp logout [name]","description":"Remove saved credentials for a profile"},
      {"name":"help","usage":"cxp help","description":"Show help"}
    ]}'
    return
  fi

  cat <<'USAGE'
cxp — Codex CLI Profile switcher

Usage: cxp [command] [args...]

Commands:
  (none)        Show current profile (whoami)
  list          List all profiles with numbers
  use <name>    Switch to a profile by name
  <name>        Shortcut for 'use <name>'
  <number>      Switch to profile by number (from list)
  next          Cycle to next saved profile
  login <name>  Run codex login --device-auth and save credentials
  logout [name] Remove saved credentials (default: active profile)
  save <name>   Save current credentials to a profile
  whoami        Show current profile details
  help          Show this help

Examples:
  cxp              Who am I?
  cxp list         Show numbered profiles
  cxp next         Cycle to next profile
  cxp 2            Switch to profile #2
  cxp ced          Switch to ced's profile
  cxp use ced      Same as above
USAGE
}

# Resolve a number to a profile name from credentialed list
resolve_number() {
  local num="$1"
  local -a profiles
  mapfile -t profiles < <(get_credentialed_profiles)
  local count=${#profiles[@]}

  if (( num < 1 || num > count )); then
    die "Profile number $num out of range (1-$count). Run 'cxp list' to see profiles."
  fi
  echo "${profiles[$((num - 1))]}"
}

# Try to match arg as a developer name
try_as_name() {
  local name="$1"
  if [[ -f "$DEVELOPERS_DIR/${name}.env" ]]; then
    cmd_use "$name"
  else
    die "Unknown command or developer: '$name'. Run 'cxp help' for usage."
  fi
}

# Main dispatch
case "${1:-}" in
  "")           cmd_whoami ;;
  help|-h|--help) cmd_help ;;
  list)         cmd_list ;;
  next)         cmd_next ;;
  whoami)       cmd_whoami ;;
  login)        shift; [[ $# -lt 1 ]] && die "Usage: cxp login <name>"; cmd_login "$1" ;;
  logout)       shift; cmd_logout "${1:-}" ;;
  save)         shift; [[ $# -lt 1 ]] && die "Usage: cxp save <name> [--force]"; cmd_save "$1" "${2:-}" ;;
  use|switch)   shift; [[ $# -lt 1 ]] && die "Usage: cxp use <name>"; cmd_use "$1" ;;
  *[!0-9]*)     try_as_name "$1" ;;
  *)            _resolved=$(resolve_number "$1") && cmd_use "$_resolved" ;;
esac
