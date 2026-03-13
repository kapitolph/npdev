#!/usr/bin/env bash
# Install Claude Code hooks for VPS developer identity.
# Idempotent — merges into existing settings without overwriting.
# Called by server/setup.sh or run standalone.

set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS_FILE="${CLAUDE_DIR}/settings.json"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install hook scripts
mkdir -p "$HOOKS_DIR"
cp "$SCRIPT_DIR/hooks/identify-developer.sh" "$HOOKS_DIR/identify-developer.sh"
chmod +x "$HOOKS_DIR/identify-developer.sh"
cp "$SCRIPT_DIR/hooks/update-session-desc.sh" "$HOOKS_DIR/update-session-desc.sh"
chmod +x "$HOOKS_DIR/update-session-desc.sh"

# Ensure settings.json exists with hooks structure
if [[ ! -f "$SETTINGS_FILE" ]]; then
  cat > "$SETTINGS_FILE" << 'EOF'
{
  "hooks": {}
}
EOF
fi

# Merge hooks into existing settings using node/bun (guaranteed on VPS)
MERGE_SCRIPT='
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync(process.argv[2], "utf-8"));
if (!settings.hooks) settings.hooks = {};

// SessionStart: identify-developer hook
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
const hasIdentify = settings.hooks.SessionStart.some(g =>
  g.hooks && g.hooks.some(h => h.command && h.command.includes("identify-developer"))
);
if (!hasIdentify) {
  settings.hooks.SessionStart.push({
    hooks: [{
      type: "command",
      command: process.env.HOME + "/.claude/hooks/identify-developer.sh",
      statusMessage: "Identifying developer..."
    }]
  });
}

// Stop: update-session-desc hook
if (!settings.hooks.Stop) settings.hooks.Stop = [];
const hasDesc = settings.hooks.Stop.some(g =>
  g.hooks && g.hooks.some(h => h.command && h.command.includes("update-session-desc"))
);
if (!hasDesc) {
  settings.hooks.Stop.push({
    hooks: [{
      type: "command",
      command: process.env.HOME + "/.claude/hooks/update-session-desc.sh",
      statusMessage: "Updating session description..."
    }]
  });
}

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

echo "Claude Code hooks installed (identify-developer + update-session-desc)."
