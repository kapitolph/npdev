#!/usr/bin/env bash
# Claude Code Profile Switcher -- save/restore per-developer Claude OAuth credentials
# Usage: ccp <command> [args...]
# Commands: list, use/switch, next, login, save, whoami, help
# Short alias: ccp ("claude code profile")

set -euo pipefail

DEVELOPERS_DIR="${DEVELOPERS_DIR:-$HOME/.vps/developers}"
REGISTRY="${REGISTRY:-$HOME/.vps/sessions.yaml}"
ACTIVE_PROFILE_FILE="${ACTIVE_PROFILE_FILE:-$HOME/.claude/.active-profile}"
ACTIVE_TOKEN_FILE="${ACTIVE_TOKEN_FILE:-$HOME/.claude/.active-token}"

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

# Check if any argument is a help flag
wants_help() {
  for arg in "$@"; do
    case "$arg" in --help|-h) return 0 ;; esac
  done
  return 1
}

# Get sorted list of developer names that have saved credentials
get_credentialed_profiles() {
  for env_file in "$DEVELOPERS_DIR"/*.env; do
    local name
    name=$(basename "$env_file" .env)
    if [[ -f "$DEVELOPERS_DIR/${name}.claude-credentials.json" ]]; then
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

# Get email from saved claude account profile
saved_email() {
  local name="$1"
  local acct="$DEVELOPERS_DIR/${name}.claude-account.json"
  [[ -f "$acct" ]] && jq -r '.oauthAccount.emailAddress // empty' "$acct" 2>/dev/null || echo ""
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

# Auto-save current env var token back to the active profile before switching.
auto_save_current() {
  [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]] || return 0

  local current
  current=$(current_profile)
  [[ -z "$current" ]] && return 0

  local saved_creds="$DEVELOPERS_DIR/${current}.claude-credentials.json"
  [[ -f "$saved_creds" ]] || return 0

  local tmp
  tmp=$(jq --arg tok "$CLAUDE_CODE_OAUTH_TOKEN" '.claudeAiOauth.accessToken = $tok' "$saved_creds")
  printf '%s' "$tmp" > "$saved_creds"
  chmod 600 "$saved_creds"
}

# Check token expiry. Returns: "valid (Xd)", "expired", or "unknown"
token_status() {
  local creds_file="$1"
  [[ -f "$creds_file" ]] || { echo "no credentials"; return; }
  local expires_at
  expires_at=$(jq -r '.claudeAiOauth.expiresAt // empty' "$creds_file" 2>/dev/null) || { echo "unknown"; return; }
  [[ -z "$expires_at" ]] && { echo "unknown"; return; }

  local now_ms
  now_ms=$(date +%s%3N 2>/dev/null || echo "0")
  if [[ "$now_ms" == "0" ]]; then
    now_ms=$(($(date +%s) * 1000))
  fi

  if (( expires_at > now_ms )); then
    local remaining_s=$(( (expires_at - now_ms) / 1000 ))
    local days=$(( remaining_s / 86400 ))
    local hours=$(( (remaining_s % 86400) / 3600 ))
    if (( days > 0 )); then
      echo "valid (${days}d)"
    else
      echo "valid (${hours}h)"
    fi
  else
    echo "expired"
  fi
}

# Check for active claude-type sessions that might be affected
check_active_sessions() {
  local switching_to="$1"
  [[ -f "$REGISTRY" ]] || return 0

  local current
  current=$(current_profile)
  [[ -z "$current" || "$current" == "$switching_to" ]] && return 0

  # Check for active claude/codex sessions in the registry
  local active_claude_sessions
  active_claude_sessions=$(awk '
    /^  - name:/ { name = $3; type = ""; status = "" }
    /type:/ { type = $2 }
    /status: active/ { status = "active" }
    status == "active" && (type == "claude" || type == "codex") { print name; name=""; type=""; status="" }
  ' "$REGISTRY" 2>/dev/null)

  if [[ -n "$active_claude_sessions" ]]; then
    warn "Active Claude session(s) detected (currently profile '$current'):"
    echo "$active_claude_sessions" | while read -r s; do
      echo "  - $s" >&2
    done
    warn "Switching credentials may affect these sessions."
  fi
}

cmd_save() {
  if wants_help "$@" || [[ $# -lt 1 ]]; then
    cat <<'HELP'
ccp save — Save the current CLAUDE_CODE_OAUTH_TOKEN to a named profile

Usage: ccp save <name> [--force]

Arguments:
  <name>     Developer name (must be registered in ~/.vps/developers/)
  --force    Overwrite if profile already exists

Captures the current CLAUDE_CODE_OAUTH_TOKEN env var into the
developer's profile credential file.
HELP
    return
  fi

  local name="$1"
  local force="${2:-}"
  validate_dev "$name"

  [[ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]] || die "CLAUDE_CODE_OAUTH_TOKEN is not set. Nothing to save."

  local dest_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"

  # Check if profile already exists
  if [[ -f "$dest_creds" ]] && [[ "$force" != "--force" ]]; then
    if $JSON_MODE; then
      die "Profile for '$name' already exists. Use --force to overwrite."
    fi
    warn "Profile for '$name' already exists. Use --force to overwrite."
    return 1
  fi

  # Update existing credential file or create new one
  if [[ -f "$dest_creds" ]]; then
    local tmp
    tmp=$(jq --arg tok "$CLAUDE_CODE_OAUTH_TOKEN" '.claudeAiOauth.accessToken = $tok' "$dest_creds")
    printf '%s' "$tmp" > "$dest_creds"
  else
    # Create new credential file (same shape as cmd_login --token)
    local now_ms expires_at
    now_ms=$(date +%s%3N 2>/dev/null || echo "$(($(date +%s) * 1000))")
    expires_at=$((now_ms + 864000 * 1000))
    jq -n --arg at "$CLAUDE_CODE_OAUTH_TOKEN" --argjson ea "$expires_at" \
      '{ claudeAiOauth: { accessToken: $at, refreshToken: "", expiresAt: $ea } }' > "$dest_creds"
  fi
  chmod 600 "$dest_creds"

  # Create account file if it doesn't exist
  local dest_acct="$DEVELOPERS_DIR/${name}.claude-account.json"
  if [[ ! -f "$dest_acct" ]]; then
    local email
    email=$(dev_email "$name")
    jq -n --arg email "$email" \
      '{"oauthAccount":{"emailAddress":$email}}' > "$dest_acct"
    chmod 600 "$dest_acct"
  fi

  set_active_profile "$name"
  printf '%s' "$CLAUDE_CODE_OAUTH_TOKEN" > "$ACTIVE_TOKEN_FILE"
  chmod 600 "$ACTIVE_TOKEN_FILE"

  local email
  email=$(saved_email "$name")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" \
      '{"ok":true,"action":"saved","profile":$profile,"email":$email}'
  else
    echo "Saved Claude profile for '$name' ($email)"
  fi
}

cmd_use() {
  if wants_help "$@" || [[ $# -lt 1 ]]; then
    cat <<'HELP'
ccp use — Switch to a developer's Claude profile

Usage: ccp use <name>

Arguments:
  <name>   Developer name (must have saved credentials)

Writes the profile's accessToken to ~/.claude/.active-token so new
shells pick it up via CLAUDE_CODE_OAUTH_TOKEN. Auto-saves the current
env var token back to the outgoing profile first.

Shortcuts:
  ccp <name>     Same as 'ccp use <name>'
  ccp <number>   Switch by profile number (from 'ccp list')
  ccp next       Cycle to the next saved profile
HELP
    return
  fi

  local name="$1"
  validate_dev "$name"

  local src_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"

  [[ -f "$src_creds" ]] || die "No saved credentials for '$name'. Run: npdev ccp login $name"

  # Warn about active sessions
  check_active_sessions "$name"

  # Auto-save current env var token back to outgoing profile
  auto_save_current

  # Check token expiry and warn
  local status
  status=$(token_status "$src_creds")
  if [[ "$status" == "expired" ]]; then
    warn "Token for '$name' is expired. Run: npdev ccp login $name"
  fi

  # Write active token
  local token
  token=$(jq -r '.claudeAiOauth.accessToken // empty' "$src_creds" 2>/dev/null)
  [[ -n "$token" ]] || die "No accessToken found in credentials for '$name'."
  printf '%s' "$token" > "$ACTIVE_TOKEN_FILE"
  chmod 600 "$ACTIVE_TOKEN_FILE"

  # Track active profile
  set_active_profile "$name"

  local email
  email=$(saved_email "$name")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" --arg token_status "$status" \
      '{"ok":true,"action":"switched","profile":$profile,"email":$email,"token_status":$token_status}'
  else
    echo "Switched to Claude profile '$name' (${email:-unknown})"
  fi
}

cmd_import() {
  if wants_help "$@" || [[ $# -lt 1 ]]; then
    cat <<'HELP'
ccp import — Import credentials from stdin JSON

Usage: ccp import <name> < credentials.json

Arguments:
  <name>   Developer name (must be registered in ~/.vps/developers/)

Reads a JSON object from stdin with this shape:
  { "credentials": { "claudeAiOauth": { ... } }, "account": { "oauthAccount": { ... } } }

Saves to profile files only — does NOT activate. Run 'ccp use <name>' to activate.

This command is typically called automatically by 'npdev ccp login <name>'
from a developer's local machine.
HELP
    return
  fi

  local name="$1"
  validate_dev "$name"

  # Read JSON from stdin
  local input
  input=$(cat)

  if [[ -z "$input" ]]; then
    die "No input received on stdin. Pipe credentials JSON to this command."
  fi

  # Validate JSON
  if ! echo "$input" | jq empty 2>/dev/null; then
    die "Invalid JSON on stdin."
  fi

  # Extract credentials and account
  local creds account
  creds=$(echo "$input" | jq -e '.credentials' 2>/dev/null) || die "Missing .credentials in input JSON."
  account=$(echo "$input" | jq -e '.account' 2>/dev/null) || die "Missing .account in input JSON."

  # Validate credentials has the expected shape
  echo "$creds" | jq -e '.claudeAiOauth.accessToken' >/dev/null 2>&1 || die "Missing .credentials.claudeAiOauth.accessToken"

  local dest_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"
  local dest_acct="$DEVELOPERS_DIR/${name}.claude-account.json"

  # Write profile files
  printf '%s' "$creds" | jq . > "$dest_creds"
  chmod 600 "$dest_creds"

  printf '%s' "$account" | jq . > "$dest_acct"
  chmod 600 "$dest_acct"

  local email
  email=$(echo "$account" | jq -r '.oauthAccount.emailAddress // "unknown"' 2>/dev/null)

  local status
  status=$(token_status "$dest_creds")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" --arg token_status "$status" \
      '{"ok":true,"action":"imported","profile":$profile,"email":$email,"token_status":$token_status}'
  else
    echo "Imported Claude profile for '$name' ($email) — token $status"
    echo "Profile saved. Run 'ccp use $name' to activate."
  fi
}

cmd_login() {
  if wants_help "$@" || [[ $# -lt 1 ]]; then
    cat <<'HELP'
ccp login — Save a token to a developer profile (VPS-side)

Usage: ccp login <name> --token <token>

Arguments:
  <name>           Developer name (must be registered in ~/.vps/developers/)
  --token <token>  OAuth access token to store

Saves the token to the developer's profile files without activating it.
Run 'ccp use <name>' afterwards to make it the active profile.

For browser-based OAuth login (recommended), run from your local machine:
  npdev ccp login <name>
HELP
    return
  fi

  local name="$1"
  shift
  validate_dev "$name"

  # Parse --token flag
  local token=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --token) token="${2:-}"; shift 2 ;;
      *) shift ;;
    esac
  done

  if [[ -z "$token" ]]; then
    die "Usage: ccp login <name> --token <token>
On VPS, only --token login is supported. For browser-based OAuth, run:
  npdev ccp login <name>"
  fi

  # Calculate expiry (assume 10 days for manually provided tokens)
  local now_ms expires_at
  now_ms=$(date +%s%3N 2>/dev/null || echo "$(($(date +%s) * 1000))")
  expires_at=$((now_ms + 864000 * 1000))

  # Build credentials JSON
  local creds
  creds=$(jq -n \
    --arg at "$token" \
    --argjson ea "$expires_at" \
    '{
      claudeAiOauth: {
        accessToken: $at,
        refreshToken: "",
        expiresAt: $ea
      }
    }')

  local dest_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"
  printf '%s' "$creds" | jq . > "$dest_creds"
  chmod 600 "$dest_creds"

  # Create a minimal account file if one doesn't already exist
  local dest_acct="$DEVELOPERS_DIR/${name}.claude-account.json"
  if [[ ! -f "$dest_acct" ]]; then
    local email
    email=$(dev_email "$name")
    jq -n --arg email "$email" \
      '{"oauthAccount":{"emailAddress":$email}}' > "$dest_acct"
    chmod 600 "$dest_acct"
  fi

  local status
  status=$(token_status "$dest_creds")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg token_status "$status" \
      '{"ok":true,"action":"login","profile":$profile,"token_status":$token_status}'
  else
    echo "Saved token for '$name' — $status"
    echo "Profile saved. Run 'ccp use $name' to activate."
  fi
}

cmd_logout() {
  if wants_help "$@"; then
    cat <<'HELP'
ccp logout — Remove saved credentials for a profile

Usage: ccp logout [name]

Arguments:
  [name]   Developer name (defaults to active profile)

Deletes the saved credential and account files for the profile.
If this is the active profile, also clears the live credentials
and active profile state.
HELP
    return
  fi

  local name="${1:-}"

  # If no name given, use active profile
  if [[ -z "$name" ]]; then
    name=$(current_profile)
    [[ -z "$name" ]] && die "No active profile. Specify a name: ccp logout <name>"
  fi

  validate_dev "$name"

  local creds_file="$DEVELOPERS_DIR/${name}.claude-credentials.json"
  local acct_file="$DEVELOPERS_DIR/${name}.claude-account.json"

  if [[ ! -f "$creds_file" ]]; then
    die "No saved credentials for '$name' — nothing to logout."
  fi

  rm -f "$creds_file" "$acct_file"

  # If this was the active profile, clear the active state and token
  local current
  current=$(current_profile)
  if [[ "$current" == "$name" ]]; then
    rm -f "$ACTIVE_PROFILE_FILE"
    rm -f "$ACTIVE_TOKEN_FILE"
  fi

  if $JSON_MODE; then
    jq -n --arg profile "$name" '{"ok":true,"action":"logout","profile":$profile}'
  else
    echo "Logged out '$name' — credentials removed."
  fi
}

cmd_next() {
  if wants_help "$@"; then
    cat <<'HELP'
ccp next — Cycle to the next saved profile

Usage: ccp next

Switches to the next profile in alphabetical order, wrapping around
to the first after the last. Only profiles with saved credentials
are included in the cycle.
HELP
    return
  fi

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
  if wants_help "$@"; then
    cat <<'HELP'
ccp list — List all developer profiles

Usage: ccp list

Shows a table of all registered developers with their profile number,
email, token status (valid/expired/not saved), and whether they're
the currently active profile. Profile numbers can be used as shortcuts:
  ccp 2   Switch to profile #2
HELP
    return
  fi

  local current
  current=$(current_profile)

  if $JSON_MODE; then
    local json_profiles="[]"
    for env_file in "$DEVELOPERS_DIR"/*.env; do
      local name
      name=$(basename "$env_file" .env)
      local email
      email=$(dev_email "$name")

      local saved_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"
      local has_creds=false
      local status="not saved"
      local active=false
      if [[ -f "$saved_creds" ]]; then
        has_creds=true
        status=$(token_status "$saved_creds")
        [[ "$name" == "$current" ]] && active=true
      fi

      json_profiles=$(echo "$json_profiles" | jq \
        --arg name "$name" \
        --arg email "$email" \
        --argjson has_creds "$has_creds" \
        --arg token_status "$status" \
        --argjson active "$active" \
        '. + [{"name":$name,"email":$email,"has_credentials":$has_creds,"token_status":$token_status,"active":$active}]')
    done

    jq -n --arg current "${current:-}" --argjson profiles "$json_profiles" \
      '{"ok":true,"current":$current,"profiles":$profiles}'
    return
  fi

  local num=0
  printf "%-10s %-3s %-35s %-15s %s\n" "PROFILE" "#" "EMAIL" "TOKEN" "ACTIVE"
  for env_file in "$DEVELOPERS_DIR"/*.env; do
    local name
    name=$(basename "$env_file" .env)
    local email
    email=$(dev_email "$name")

    local saved_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"
    if [[ -f "$saved_creds" ]]; then
      num=$((num + 1))
      local status
      status=$(token_status "$saved_creds")
      local active=""
      [[ "$name" == "$current" ]] && active="*"
      printf "%-10s %-3s %-35s %-15s %s\n" "$name" "$num" "$email" "$status" "$active"
    else
      printf "%-10s %-3s %-35s %-15s %s\n" "$name" "-" "$email" "(not saved)" ""
    fi
  done
}

cmd_whoami() {
  if wants_help "$@"; then
    cat <<'HELP'
ccp whoami — Show the currently active profile

Usage: ccp whoami

Displays the active profile name, email, subscription type, and
token status. If no active profile is tracked, attempts to match
the live credentials to a saved profile by email address.

This is the default command when running 'ccp' with no arguments.
HELP
    return
  fi

  local current
  current=$(current_profile)

  if [[ -z "$current" ]]; then
    if $JSON_MODE; then
      jq -n '{"ok":true,"profile":null,"message":"No active profile. Run: ccp use <name>"}'
    else
      echo "No active profile. Run: ccp use <name>"
    fi
    return
  fi

  local email status
  email=$(saved_email "$current")
  [[ -z "$email" ]] && email=$(dev_email "$current")

  local saved_creds="$DEVELOPERS_DIR/${current}.claude-credentials.json"
  status=$(token_status "$saved_creds")

  if $JSON_MODE; then
    jq -n --arg profile "$current" --arg email "$email" --arg token_status "$status" \
      '{"ok":true,"profile":$profile,"email":$email,"token_status":$token_status}'
  else
    echo "Active profile: $current (${email:-unknown}) | token ${status:-unknown}"
  fi
}

cmd_help() {
  if $JSON_MODE; then
    jq -n '{"ok":true,"commands":[
      {"name":"whoami","usage":"ccp","description":"Show current profile (default)"},
      {"name":"list","usage":"ccp list","description":"List all profiles with numbers"},
      {"name":"use","usage":"ccp use <name>","description":"Switch to a profile by name"},
      {"name":"next","usage":"ccp next","description":"Cycle to next saved profile"},
      {"name":"login","usage":"ccp login <name> --token <token>","description":"Save token to profile"},
      {"name":"import","usage":"ccp import <name>","description":"Import credentials from stdin JSON"},
      {"name":"save","usage":"ccp save <name>","description":"Save current credentials to a profile"},
      {"name":"logout","usage":"ccp logout [name]","description":"Remove saved credentials for a profile"},
      {"name":"help","usage":"ccp help","description":"Show help"}
    ]}'
    return
  fi

  cat <<'USAGE'
ccp — Claude Code Profile switcher

Usage: ccp [command] [args...]

Commands:
  (none)        Show current profile (whoami)
  list          List all profiles with numbers
  use <name>    Switch to a profile by name
  <name>        Shortcut for 'use <name>'
  <number>      Switch to profile by number (from list)
  next          Cycle to next saved profile
  login <name> --token <token>  Save token to profile
  import <name> Import credentials from stdin JSON
  logout [name] Remove saved credentials (default: active profile)
  save <name>   Save current credentials to a profile
  whoami        Show current profile details
  help          Show this help

Examples:
  ccp              Who am I?
  ccp list         Show numbered profiles
  ccp next         Cycle to next profile
  ccp 2            Switch to profile #2
  ccp don          Switch to don's profile
  ccp use don      Same as above
USAGE
}

# Resolve a number to a profile name from credentialed list
resolve_number() {
  local num="$1"
  local -a profiles
  mapfile -t profiles < <(get_credentialed_profiles)
  local count=${#profiles[@]}

  if (( num < 1 || num > count )); then
    die "Profile number $num out of range (1-$count). Run 'ccp list' to see profiles."
  fi
  echo "${profiles[$((num - 1))]}"
}

# Try to match arg as a developer name
try_as_name() {
  local name="$1"
  if [[ -f "$DEVELOPERS_DIR/${name}.env" ]]; then
    cmd_use "$name"
  else
    die "Unknown command or developer: '$name'. Run 'ccp help' for usage."
  fi
}

# Main dispatch
case "${1:-}" in
  "")           cmd_whoami ;;
  help|-h|--help) cmd_help ;;
  list)         shift; cmd_list "$@" ;;
  next)         shift; cmd_next "$@" ;;
  whoami)       shift; cmd_whoami "$@" ;;
  login)        shift; cmd_login "$@" ;;
  import)       shift; cmd_import "$@" ;;
  logout)       shift; cmd_logout "$@" ;;
  save)         shift; cmd_save "$@" ;;
  use|switch)   shift; cmd_use "$@" ;;
  *[!0-9]*)     try_as_name "$1" ;;
  *)            _resolved=$(resolve_number "$1") && cmd_use "$_resolved" ;;
esac
