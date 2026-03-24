#!/usr/bin/env bash
# Claude Code Profile Switcher -- save/restore per-developer Claude OAuth credentials
# Usage: ccp <command> [args...]
# Commands: list, use/switch, next, login, save, whoami, help
# Short alias: ccp ("claude code profile")

set -euo pipefail

DEVELOPERS_DIR="${DEVELOPERS_DIR:-$HOME/.vps/developers}"
CREDENTIALS_FILE="${CREDENTIALS_FILE:-$HOME/.claude/.credentials.json}"
ACCOUNT_FILE="${ACCOUNT_FILE:-$HOME/.claude.json}"
REGISTRY="${REGISTRY:-$HOME/.vps/sessions.yaml}"
ACTIVE_PROFILE_FILE="${ACTIVE_PROFILE_FILE:-$HOME/.claude/.active-profile}"

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

# Auto-save current live credentials back to the active profile before switching.
# This captures any auto-refreshed tokens that Claude CLI updated silently.
auto_save_current() {
  [[ -f "$CREDENTIALS_FILE" ]] || return 0
  [[ -f "$ACCOUNT_FILE" ]] || return 0

  local current
  current=$(current_profile)
  [[ -z "$current" ]] && return 0

  # Silently update the saved credentials with the live (possibly refreshed) ones
  cp "$CREDENTIALS_FILE" "$DEVELOPERS_DIR/${current}.claude-credentials.json"
  chmod 600 "$DEVELOPERS_DIR/${current}.claude-credentials.json"
  jq '{userID, oauthAccount}' "$ACCOUNT_FILE" > "$DEVELOPERS_DIR/${current}.claude-account.json"
  chmod 600 "$DEVELOPERS_DIR/${current}.claude-account.json"
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
  local name="$1"
  local force="${2:-}"
  validate_dev "$name"

  local dest_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"
  local dest_acct="$DEVELOPERS_DIR/${name}.claude-account.json"

  # Check if profile already exists
  if [[ -f "$dest_creds" ]] && [[ "$force" != "--force" ]]; then
    if $JSON_MODE; then
      die "Profile for '$name' already exists. Use --force to overwrite."
    fi
    warn "Profile for '$name' already exists. Use --force to overwrite."
    return 1
  fi

  # Validate source files exist
  [[ -f "$CREDENTIALS_FILE" ]] || die "No credentials file found at $CREDENTIALS_FILE"
  [[ -f "$ACCOUNT_FILE" ]] || die "No account file found at $ACCOUNT_FILE"

  # Validate JSON before writing
  jq empty "$CREDENTIALS_FILE" 2>/dev/null || die "Invalid JSON in $CREDENTIALS_FILE"
  jq empty "$ACCOUNT_FILE" 2>/dev/null || die "Invalid JSON in $ACCOUNT_FILE"

  # Copy credentials verbatim
  cp "$CREDENTIALS_FILE" "$dest_creds"
  chmod 600 "$dest_creds"

  # Extract account fields
  jq '{userID, oauthAccount}' "$ACCOUNT_FILE" > "$dest_acct"
  chmod 600 "$dest_acct"

  local email
  email=$(jq -r '.oauthAccount.emailAddress // "unknown"' "$dest_acct")

  # Guard: reject if another profile already uses this email
  if [[ "$email" != "unknown" ]]; then
    for env_file in "$DEVELOPERS_DIR"/*.env; do
      local other
      other=$(basename "$env_file" .env)
      [[ "$other" == "$name" ]] && continue
      local other_acct="$DEVELOPERS_DIR/${other}.claude-account.json"
      [[ -f "$other_acct" ]] || continue
      local other_email
      other_email=$(jq -r '.oauthAccount.emailAddress // empty' "$other_acct" 2>/dev/null) || true
      if [[ "$other_email" == "$email" ]]; then
        # Roll back written files
        rm -f "$dest_creds" "$dest_acct"
        die "Email '$email' is already saved under profile '$other'. Each profile must use a unique account."
      fi
    done
  fi

  set_active_profile "$name"

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg email "$email" \
      '{"ok":true,"action":"saved","profile":$profile,"email":$email}'
  else
    echo "Saved Claude profile for '$name' ($email)"
  fi
}

cmd_use() {
  local name="$1"
  validate_dev "$name"

  local src_creds="$DEVELOPERS_DIR/${name}.claude-credentials.json"
  local src_acct="$DEVELOPERS_DIR/${name}.claude-account.json"

  [[ -f "$src_creds" ]] || die "No saved credentials for '$name'. Run: ccp login $name"
  [[ -f "$src_acct" ]] || die "No saved account for '$name'. Run: ccp login $name"

  # Warn about active sessions
  check_active_sessions "$name"

  # Auto-save current profile's credentials before overwriting (captures refreshed tokens)
  auto_save_current

  # Check token expiry and warn
  local status
  status=$(token_status "$src_creds")
  if [[ "$status" == "expired" ]]; then
    warn "Token for '$name' is expired. Claude CLI should handle refresh automatically."
  fi

  # Restore credentials
  cp "$src_creds" "$CREDENTIALS_FILE"
  chmod 600 "$CREDENTIALS_FILE"

  # Merge account fields into .claude.json atomically
  local tmp_file="${ACCOUNT_FILE}.tmp"
  if [[ -f "$ACCOUNT_FILE" ]]; then
    jq --slurpfile acct "$src_acct" '. * $acct[0]' "$ACCOUNT_FILE" > "$tmp_file"
  else
    cp "$src_acct" "$tmp_file"
  fi
  mv "$tmp_file" "$ACCOUNT_FILE"

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

cmd_refresh() {
  local name="${1:-}"

  # If no name given, use active profile
  if [[ -z "$name" ]]; then
    name=$(current_profile)
    [[ -z "$name" ]] && die "No active profile. Specify a name: ccp refresh <name>"
  fi

  validate_dev "$name"

  local creds_file="$DEVELOPERS_DIR/${name}.claude-credentials.json"
  [[ -f "$creds_file" ]] || die "No saved credentials for '$name'. Run: ccp login $name"

  local refresh_token
  refresh_token=$(jq -r '.claudeAiOauth.refreshToken // empty' "$creds_file" 2>/dev/null)
  [[ -z "$refresh_token" ]] && die "No refresh token found for '$name'. Run: ccp login $name"

  # Skip refresh if token is still valid with >1 day remaining (avoid rate limits)
  local force="${2:-}"
  if [[ "$force" != "--force" ]]; then
    local expires_at
    expires_at=$(jq -r '.claudeAiOauth.expiresAt // empty' "$creds_file" 2>/dev/null)
    if [[ -n "$expires_at" ]]; then
      local now_ms
      now_ms=$(date +%s%3N 2>/dev/null || echo "$(($(date +%s) * 1000))")
      local remaining_s=$(( (expires_at - now_ms) / 1000 ))
      if (( remaining_s > 7200 )); then
        local days=$(( remaining_s / 86400 ))
        local hours=$(( (remaining_s % 86400) / 3600 ))
        if $JSON_MODE; then
          local remaining_label
          if (( days > 0 )); then remaining_label="${days}d"; else remaining_label="${hours}h"; fi
          jq -n --arg profile "$name" --arg token_status "valid (${remaining_label})" \
            '{"ok":true,"action":"skipped","profile":$profile,"token_status":$token_status,"message":"Token still valid — use --force to refresh anyway"}'
        else
          local remaining_label
          if (( days > 0 )); then remaining_label="${days}d"; else remaining_label="${hours}h"; fi
          echo "Token for '$name' still valid (${remaining_label} remaining) — skipping. Use --force to refresh anyway."
        fi
        return 0
      fi
    fi
  fi

  local CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
  local TOKEN_URL="https://platform.claude.com/v1/oauth/token"

  $JSON_MODE || echo "Refreshing token for '$name'..."

  local response
  response=$(curl -sS -X POST "$TOKEN_URL" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg rt "$refresh_token" \
      --arg client_id "$CLIENT_ID" \
      '{
        grant_type: "refresh_token",
        refresh_token: $rt,
        client_id: $client_id
      }')" 2>&1)

  # Check for error
  if ! echo "$response" | jq -e '.access_token' >/dev/null 2>&1; then
    local err_msg
    err_msg=$(echo "$response" | jq -r '.error_description // .error // "Unknown error"' 2>/dev/null || echo "$response")
    die "Token refresh failed: $err_msg"
  fi

  # Extract tokens
  local access_token new_refresh_token expires_in
  access_token=$(echo "$response" | jq -r '.access_token')
  new_refresh_token=$(echo "$response" | jq -r '.refresh_token // empty')
  expires_in=$(echo "$response" | jq -r '.expires_in // 86400')

  # Keep the old refresh token if the server didn't issue a new one
  [[ -z "$new_refresh_token" ]] && new_refresh_token="$refresh_token"

  # Calculate expiry timestamp in milliseconds
  local now_ms expires_at
  now_ms=$(date +%s%3N 2>/dev/null || echo "$(($(date +%s) * 1000))")
  expires_at=$((now_ms + expires_in * 1000))

  # Build credentials JSON
  local creds
  creds=$(jq -n \
    --arg at "$access_token" \
    --arg rt "$new_refresh_token" \
    --argjson ea "$expires_at" \
    '{
      claudeAiOauth: {
        accessToken: $at,
        refreshToken: $rt,
        expiresAt: $ea
      }
    }')

  # Write to saved profile
  printf '%s' "$creds" | jq . > "$creds_file"
  chmod 600 "$creds_file"

  # If this is the active profile, also update live credentials
  local current
  current=$(current_profile)
  if [[ "$current" == "$name" ]]; then
    printf '%s' "$creds" | jq . > "$CREDENTIALS_FILE"
    chmod 600 "$CREDENTIALS_FILE"
  fi

  local status
  status=$(token_status "$creds_file")

  if $JSON_MODE; then
    jq -n --arg profile "$name" --arg token_status "$status" \
      '{"ok":true,"action":"refreshed","profile":$profile,"token_status":$token_status}'
  else
    echo "Refreshed token for '$name' — $status"
  fi
}

cmd_logout() {
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

  # If this was the active profile, clear the active state and live credentials
  local current
  current=$(current_profile)
  if [[ "$current" == "$name" ]]; then
    rm -f "$ACTIVE_PROFILE_FILE"
    rm -f "$CREDENTIALS_FILE"
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
  local current
  current=$(current_profile)

  if [[ -z "$current" ]]; then
    # Try to find matching profile by email before giving up
    if [[ -f "$ACCOUNT_FILE" ]]; then
      local live_email
      live_email=$(jq -r '.oauthAccount.emailAddress // empty' "$ACCOUNT_FILE" 2>/dev/null)
      if [[ -n "$live_email" ]]; then
        for env_file in "$DEVELOPERS_DIR"/*.env; do
          local pname
          pname=$(basename "$env_file" .env)
          local saved
          saved=$(saved_email "$pname")
          if [[ "$saved" == "$live_email" ]]; then
            current="$pname"
            set_active_profile "$current"
            break
          fi
        done
      fi
    fi
  fi

  if [[ -z "$current" ]]; then
    if $JSON_MODE; then
      if [[ -f "$ACCOUNT_FILE" ]]; then
        local email
        email=$(jq -r '.oauthAccount.emailAddress // "unknown"' "$ACCOUNT_FILE" 2>/dev/null)
        jq -n --arg email "$email" \
          '{"ok":true,"profile":null,"email":$email,"message":"No matching saved profile for current credentials."}'
      else
        jq -n '{"ok":true,"profile":null,"message":"No credentials found."}'
      fi
    else
      echo "No matching saved profile for current credentials."
      # Still show what we can from live files
      if [[ -f "$ACCOUNT_FILE" ]]; then
        local email sub
        email=$(jq -r '.oauthAccount.emailAddress // "unknown"' "$ACCOUNT_FILE" 2>/dev/null)
        sub=$(jq -r '.oauthAccount // empty | keys[]' "$ACCOUNT_FILE" 2>/dev/null | head -1)
        echo "Current account: $email"
        echo "Hint: run 'ccp save <name>' to save these credentials to a profile."
      fi
    fi
    return
  fi

  local email sub status
  email=$(saved_email "$current")
  sub="unknown"
  status="unknown"
  [[ -f "$CREDENTIALS_FILE" ]] && {
    sub=$(jq -r '.claudeAiOauth.subscriptionType // "unknown"' "$CREDENTIALS_FILE" 2>/dev/null)
    status=$(token_status "$CREDENTIALS_FILE")
  }

  if $JSON_MODE; then
    jq -n --arg profile "$current" --arg email "$email" \
      --arg subscription "$sub" --arg token_status "$status" \
      '{"ok":true,"profile":$profile,"email":$email,"subscription":$subscription,"token_status":$token_status}'
  else
    echo "Active profile: $current ($email) | ${sub:-unknown} | token ${status:-unknown}"
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
      {"name":"refresh","usage":"ccp refresh [name] [--force]","description":"Refresh token (skips if >1d remaining, --force to override)"},
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
  refresh [name] [--force]  Refresh token (skips if >1d left, --force overrides)
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
  list)         cmd_list ;;
  next)         cmd_next ;;
  whoami)       cmd_whoami ;;
  login)        shift; [[ $# -lt 1 ]] && die "Usage: ccp login <name> --token <token>"; cmd_login "$@" ;;
  import)       shift; [[ $# -lt 1 ]] && die "Usage: ccp import <name> (JSON on stdin)"; cmd_import "$@" ;;
  refresh)      shift; cmd_refresh "${1:-}" "${2:-}" ;;
  logout)       shift; cmd_logout "${1:-}" ;;
  save)         shift; [[ $# -lt 1 ]] && die "Usage: ccp save <name> [--force]"; cmd_save "$1" "${2:-}" ;;
  use|switch)   shift; [[ $# -lt 1 ]] && die "Usage: ccp use <name>"; cmd_use "$1" ;;
  *[!0-9]*)     try_as_name "$1" ;;
  *)            _resolved=$(resolve_number "$1") && cmd_use "$_resolved" ;;
esac
