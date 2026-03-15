#!/usr/bin/env bash
# Auto-update npdev binary on this VPS when a new GitHub release is available.
# Intended to run via cron every few minutes.
# Uses public GitHub API — no auth needed for public repos.
set -euo pipefail

BINARY="/home/dev/.local/bin/npdev"
REPO="kapitolph/npdev"
ASSET="npdev-linux-x64"
LOG="/tmp/npdev-auto-update.log"

# Get current installed version
CURRENT=$("$BINARY" --version 2>/dev/null | awk '{print $NF}') || CURRENT="0.0.0"

# Get latest release tag from GitHub API (strip leading 'v')
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
  | grep '"tag_name"' | head -1 | sed 's/.*"v\([^"]*\)".*/\1/') || exit 0

[ -z "$LATEST" ] && exit 0

# Skip if already up to date
if [ "$CURRENT" = "$LATEST" ]; then
  exit 0
fi

echo "$(date -Iseconds) Updating npdev: $CURRENT → $LATEST" >> "$LOG"

# Download binary from release assets, then atomic swap
TMP=$(mktemp)
DOWNLOAD_URL="https://github.com/$REPO/releases/latest/download/$ASSET"
if curl -fsSL "$DOWNLOAD_URL" -o "$TMP"; then
  chmod +x "$TMP"
  mv "$TMP" "$BINARY"
  echo "$(date -Iseconds) Updated npdev to $LATEST" >> "$LOG"
else
  rm -f "$TMP"
  echo "$(date -Iseconds) Failed to download $DOWNLOAD_URL" >> "$LOG"
fi
