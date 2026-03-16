#!/usr/bin/env bash
# npdev client installer — idempotent
# Installs npdev as a shell wrapper + compiled binary (npdev-core).
# The wrapper hands off SSH exec to avoid Bun stdin contention after Ink.
#
# Usage (from repo checkout):
#   bash client/setup.sh
#
# Usage (curl-pipe, no clone needed):
#   curl -fsSL https://raw.githubusercontent.com/kapitolph/npdev/main/client/setup.sh | bash

set -euo pipefail

info()  { printf '\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; }
die()   { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

GITHUB_REPO="kapitolph/npdev"
NPDEV_DIR="$HOME/.npdev"
CORE_BIN_DIR="$NPDEV_DIR/bin"
INSTALL_DIR="$HOME/.local/bin"

# Detect platform
detect_platform() {
  local os arch
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux)  os="linux" ;;
    *)      die "Unsupported OS: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64)        arch="x64" ;;
    *)             die "Unsupported architecture: $(uname -m)" ;;
  esac
  echo "${os}-${arch}"
}

# ─── Step 1: Install npdev-core binary ─────────────────────────────────────
info "Installing npdev-core binary..."

mkdir -p "$NPDEV_DIR" "$CORE_BIN_DIR" "$INSTALL_DIR"

PLATFORM="$(detect_platform)"

# Prefer local repo build if available, otherwise fetch from GitHub releases
SCRIPT_DIR=""
if [[ -f "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
REPO_ROOT="${SCRIPT_DIR:+$(dirname "$SCRIPT_DIR")}"

if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/client/interactive/dist/npdev-${PLATFORM}" ]]; then
  cp "$REPO_ROOT/client/interactive/dist/npdev-${PLATFORM}" "$CORE_BIN_DIR/npdev-core"
  ok "Installed npdev-core from repo build (${PLATFORM})"
else
  info "Downloading npdev-${PLATFORM} from GitHub releases..."
  if curl -fsSL -o "$CORE_BIN_DIR/npdev-core" \
    "https://github.com/${GITHUB_REPO}/releases/latest/download/npdev-${PLATFORM}" 2>/dev/null; then
    ok "Installed npdev-core from GitHub releases (${PLATFORM})"
  else
    die "Failed to download npdev binary for ${PLATFORM}"
  fi
fi
chmod +x "$CORE_BIN_DIR/npdev-core"

# Ad-hoc sign on macOS — Apple Silicon kills unsigned Mach-O binaries
if [[ "$(uname -s)" == "Darwin" ]] && command -v codesign &>/dev/null; then
  codesign -s - "$CORE_BIN_DIR/npdev-core" 2>/dev/null && ok "Ad-hoc signed binary for macOS" || true
fi

# ─── Step 2: Install wrapper script ───────────────────────────────────────
info "Installing npdev wrapper script..."

cat > "$INSTALL_DIR/npdev" << 'WRAPPER'
#!/usr/bin/env bash
NPDEV_CORE="${HOME}/.npdev/bin/npdev-core"
[ -x "$NPDEV_CORE" ] || { echo "npdev-core not found. Run: npdev update" >&2; exit 1; }
export NPDEV_EXEC_FILE="/tmp/npdev-exec-$$"
"$NPDEV_CORE" "$@"
exit_code=$?
if [ "$exit_code" -eq 10 ] && [ -f "$NPDEV_EXEC_FILE" ]; then
  cmd=$(cat "$NPDEV_EXEC_FILE")
  rm -f "$NPDEV_EXEC_FILE"
  stty sane 2>/dev/null
  exec bash -c "$cmd"
fi
rm -f "$NPDEV_EXEC_FILE"
exit $exit_code
WRAPPER
chmod +x "$INSTALL_DIR/npdev"
ok "Wrapper script installed"

# ─── Step 3: Install machines.yaml ───────────────────────────────────────
info "Configuring machines..."

if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/machines.yaml" ]]; then
  cp "$REPO_ROOT/machines.yaml" "$NPDEV_DIR/machines.yaml"
  ok "Copied machines.yaml from repo checkout"
else
  curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/machines.yaml" -o "$NPDEV_DIR/machines.yaml"
  ok "Fetched machines.yaml from GitHub"
fi

# ─── Step 4: Check PATH ──────────────────────────────────────────────────
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  warn "$INSTALL_DIR is not in your PATH."
  echo "  Add this to your shell config (~/.zshrc or ~/.bashrc):"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo ""
  echo "  Then reload: source ~/.zshrc  (or restart your terminal)"
else
  ok "$INSTALL_DIR is in PATH"
fi

# ─── Step 5: Verify ──────────────────────────────────────────────────────
info "Verifying..."

if command -v npdev &>/dev/null; then
  ok "npdev is available: $(npdev --version)"
else
  warn "npdev not yet on PATH (see above). After fixing PATH, test with: npdev --version"
fi

echo ""
echo "  Setup complete! To update later: npdev update"
echo ""
