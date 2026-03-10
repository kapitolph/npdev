#!/usr/bin/env bash
# npdev client installer — idempotent
# Installs npdev as a standalone CLI. No repo clone needed after install.
#
# Usage (from repo checkout):
#   bash client/setup.sh
#
# Usage (curl-pipe, no clone needed):
#   curl -fsSL https://raw.githubusercontent.com/kapitolph/dev-vps/main/client/setup.sh | bash

set -euo pipefail

info()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; }

GITHUB_REPO="kapitolph/dev-vps"
NPDEV_DIR="$HOME/.npdev"
INSTALL_DIR="$HOME/.local/bin"

# ─── Step 1: Install npdev script ────────────────────────────────────────────
info "Installing npdev CLI..."

mkdir -p "$NPDEV_DIR" "$INSTALL_DIR"

# Prefer local repo copy if available, otherwise fetch from GitHub
SCRIPT_DIR=""
if [[ -f "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
REPO_ROOT="${SCRIPT_DIR:+$(dirname "$SCRIPT_DIR")}"

if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/client/npdev" ]]; then
  cp "$REPO_ROOT/client/npdev" "$INSTALL_DIR/npdev"
  ok "Installed npdev from repo checkout"
else
  curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/client/npdev" -o "$INSTALL_DIR/npdev"
  ok "Installed npdev from GitHub"
fi
chmod +x "$INSTALL_DIR/npdev"

# ─── Step 2: Install machines.yaml ───────────────────────────────────────────
info "Configuring machines..."

if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/machines.yaml" ]]; then
  cp "$REPO_ROOT/machines.yaml" "$NPDEV_DIR/machines.yaml"
  ok "Copied machines.yaml from repo checkout"
else
  curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/machines.yaml" -o "$NPDEV_DIR/machines.yaml"
  ok "Fetched machines.yaml from GitHub"
fi

# ─── Step 3: Check PATH ──────────────────────────────────────────────────────
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  warn "$INSTALL_DIR is not in your PATH."
  echo "  Add this to your shell config (~/.zshrc or ~/.bashrc):"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "  Then reload: source ~/.zshrc  (or restart your terminal)"
else
  ok "$INSTALL_DIR is in PATH"
fi

# ─── Step 4: Verify ──────────────────────────────────────────────────────────
info "Verifying..."

if command -v npdev &>/dev/null; then
  ok "npdev is available: $(npdev --version)"
else
  warn "npdev not yet on PATH (see above). After fixing PATH, test with: npdev --version"
fi

echo ""
echo "  Setup complete! To update later: npdev update"
echo ""
