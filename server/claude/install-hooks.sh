#!/usr/bin/env bash
# Install Claude Code hooks for VPS developer identity.
# Idempotent — merges into existing settings without overwriting.
# Called by server/setup.sh or run standalone.

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install hook script
mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/hooks/identify-developer.sh" "$HOOKS_DIR/identify-developer.sh"
chmod +x "$HOOKS_DIR/identify-developer.sh"

# Ensure settings.json exists with hooks structure
if [[ ! -f "$SETTINGS_FILE" ]]; then
  cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {}
}
EOF
fi

# Check if SessionStart hook already configured
if grep -q 'identify-developer' "$SETTINGS_FILE" 2>/dev/null; then
  echo "Claude Code developer identity hook already configured."
  exit 0
fi

# Merge SessionStart hook into existing settings using a temp file + jq-free approach
# We use node/bun since they're guaranteed to be on the VPS
MERGE_SCRIPT='
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
settings.hooks.SessionStart.push({
  hooks: [{
    type: "command",
    command: process.env.HOME + "/.claude/hooks/identify-developer.sh",
    statusMessage: "Identifying developer..."
  }]
});
fs.writeFileSync(process.argv[2], JSON.stringify(settings, null, 2) + "\n");
'

# Prefer bun, fall back to node
if command -v bun &>/dev/null; then
  bun -e "$MERGE_SCRIPT" -- "$SETTINGS_FILE"
elif command -v node &>/dev/null; then
  node -e "$MERGE_SCRIPT" -- "$SETTINGS_FILE"
else
  echo "WARNING: Neither bun nor node found — cannot merge Claude settings." >&2
  exit 1
fi

echo "Claude Code developer identity hook installed."
