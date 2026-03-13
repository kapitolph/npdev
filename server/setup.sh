#!/usr/bin/env bash
# nextpay-dev-vps: Server Provisioning Script
# Idempotent — safe to re-run on an already-configured VPS.
#
# Usage (from repo checkout):
#   sudo bash server/setup.sh
#
# Usage (curl-pipe, standalone):
#   curl -fsSL https://raw.githubusercontent.com/kapitolph/npdev/main/server/setup.sh | sudo bash

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
SHARED_USER="dev"
SHARED_GROUP="dev"
REPO_URL="https://github.com/kapitolph/nextpay-v3.git"
REPO_DIR="/home/$SHARED_USER/nextpay"
VPS_DIR="/home/$SHARED_USER/.vps"

# Detect whether we're running from a repo checkout or curl-pipe
SCRIPT_DIR=""
if [[ -f "${BASH_SOURCE[0]:-}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # Verify it looks like a repo checkout (parent has machines.yaml)
  if [[ ! -f "$SCRIPT_DIR/../machines.yaml" ]]; then
    SCRIPT_DIR=""
  fi
fi
REPO_ROOT="${SCRIPT_DIR:+$(dirname "$SCRIPT_DIR")}"

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m  ⚠ %s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*"; exit 1; }

need_root() {
  [[ $EUID -eq 0 ]] || fail "This script must be run as root (use sudo)."
}

run_as_dev() {
  sudo -u "$SHARED_USER" -i bash -c "$1"
}

# Copy a file from the repo checkout, or fall back to writing inline content
# Usage: install_file <source_relative_path> <dest_path> <fallback_heredoc_function>
install_file() {
  local src_rel="$1" dest="$2" fallback_fn="$3"
  if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/$src_rel" ]]; then
    cp "$REPO_ROOT/$src_rel" "$dest"
    ok "Installed $dest (from repo)"
  else
    "$fallback_fn" > "$dest"
    ok "Installed $dest (inline fallback)"
  fi
}

# ─── Step 0: Preflight ───────────────────────────────────────────────────────
need_root

info "Checking prerequisites..."
for cmd in curl git; do
  command -v "$cmd" &>/dev/null || { apt-get update -qq && apt-get install -y -qq "$cmd"; }
  ok "$cmd"
done

# Install tmux if missing
if ! command -v tmux &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq tmux
fi
ok "tmux $(tmux -V)"

# ─── Step 1: Create shared user ──────────────────────────────────────────────
info "Setting up shared user '$SHARED_USER'..."

# Create group if it doesn't exist
if ! getent group "$SHARED_GROUP" &>/dev/null; then
  groupadd "$SHARED_GROUP"
  ok "Created group '$SHARED_GROUP'"
else
  ok "Group '$SHARED_GROUP' already exists"
fi

# Create user if it doesn't exist
if ! id "$SHARED_USER" &>/dev/null; then
  useradd -m -s /bin/bash -g "$SHARED_GROUP" "$SHARED_USER"
  ok "Created user '$SHARED_USER'"
else
  ok "User '$SHARED_USER' already exists"
fi

# Set up SSH directory
mkdir -p "/home/$SHARED_USER/.ssh"
chmod 700 "/home/$SHARED_USER/.ssh"
touch "/home/$SHARED_USER/.ssh/authorized_keys"
chmod 600 "/home/$SHARED_USER/.ssh/authorized_keys"
chown -R "$SHARED_USER:$SHARED_GROUP" "/home/$SHARED_USER/.ssh"
ok "SSH directory ready"

# ─── Step 2: Collect SSH public keys ─────────────────────────────────────────
info "SSH public key setup"

EXISTING_KEYS=$(wc -l < "/home/$SHARED_USER/.ssh/authorized_keys" 2>/dev/null || echo 0)
echo "  Currently $EXISTING_KEYS key(s) in authorized_keys."

# Import keys from keys/*.pub in repo checkout
if [[ -n "$REPO_ROOT" ]] && [[ -d "$REPO_ROOT/keys" ]]; then
  for pubkey_file in "$REPO_ROOT"/keys/*.pub; do
    [[ -f "$pubkey_file" ]] || continue
    key_name="$(basename "$pubkey_file" .pub)"
    while IFS= read -r key; do
      [[ -z "$key" || "$key" == \#* ]] && continue
      if ! grep -qF "$key" "/home/$SHARED_USER/.ssh/authorized_keys" 2>/dev/null; then
        echo "$key" >> "/home/$SHARED_USER/.ssh/authorized_keys"
        ok "Added key from keys/$key_name.pub"
      else
        ok "Key from '$key_name' already present"
      fi
    done < "$pubkey_file"
  done
fi

# Fallback: scan other users' home directories (for curl-pipe mode)
for home_dir in /home/*/; do
  user=$(basename "$home_dir")
  [[ "$user" == "$SHARED_USER" ]] && continue
  if [[ -f "$home_dir/.ssh/authorized_keys" ]]; then
    while IFS= read -r key; do
      [[ -z "$key" || "$key" == \#* ]] && continue
      if ! grep -qF "$key" "/home/$SHARED_USER/.ssh/authorized_keys" 2>/dev/null; then
        echo "$key" >> "/home/$SHARED_USER/.ssh/authorized_keys"
        ok "Imported key from user '$user'"
      else
        ok "Key from '$user' already present"
      fi
    done < "$home_dir/.ssh/authorized_keys"
  fi
done

chown "$SHARED_USER:$SHARED_GROUP" "/home/$SHARED_USER/.ssh/authorized_keys"

# ─── Step 3: Install Bun ─────────────────────────────────────────────────────
info "Installing Bun..."
if run_as_dev "command -v bun &>/dev/null"; then
  ok "Bun already installed: $(run_as_dev 'bun --version')"
else
  run_as_dev 'curl -fsSL https://bun.sh/install | bash'
  ok "Bun installed: $(run_as_dev 'source ~/.bashrc && bun --version')"
fi

# ─── Step 4: Install Volta + Node.js ─────────────────────────────────────────
info "Installing Volta..."
if run_as_dev "command -v volta &>/dev/null"; then
  ok "Volta already installed: $(run_as_dev 'volta --version')"
else
  run_as_dev 'curl https://get.volta.sh | bash -s -- --skip-setup'
  ok "Volta installed"
fi

info "Installing Node.js via Volta..."
run_as_dev 'export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" && volta install node'
ok "Node.js installed: $(run_as_dev 'export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" && node --version')"

# ─── Step 5: Install Claude Code ─────────────────────────────────────────────
info "Installing Claude Code..."
if run_as_dev 'export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" && command -v claude &>/dev/null'; then
  ok "Claude Code already installed"
else
  run_as_dev 'export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" && npm install -g @anthropic-ai/claude-code'
  ok "Claude Code installed"
fi

# ─── Step 6: Install Codex CLI ───────────────────────────────────────────────
info "Installing Codex CLI..."
if run_as_dev 'export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" && command -v codex &>/dev/null'; then
  ok "Codex CLI already installed"
else
  run_as_dev 'export VOLTA_HOME="$HOME/.volta" && export PATH="$VOLTA_HOME/bin:$PATH" && npm install -g @openai/codex'
  ok "Codex CLI installed"
fi

# ─── Step 7: GitHub authentication ───────────────────────────────────────────
info "Setting up GitHub CLI..."

# Install gh if missing
if ! command -v gh &>/dev/null; then
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  apt-get update -qq && apt-get install -y -qq gh
  ok "GitHub CLI installed"
else
  ok "GitHub CLI already installed"
fi

info "GitHub authentication..."
echo "  Per-developer tokens are used (via npdev setup + git credential helper)."
echo "  Skipping shared gh auth login — each developer's GH_TOKEN is injected per session."
ok "GitHub auth: per-developer tokens via ~/.vps/git-credential-token"

# ─── Step 8: Clone repository (optional) ─────────────────────────────────────
info "Cloning repository..."
if [[ -d "$REPO_DIR/.git" ]]; then
  ok "Repository already cloned at $REPO_DIR"
  run_as_dev "cd $REPO_DIR && git pull --ff-only" || warn "Pull failed (probably has local changes)"
else
  # Clone requires GitHub auth — skip if no token available.
  # Developers will clone in their sessions where GH_TOKEN is set via npdev setup.
  if run_as_dev "git ls-remote $REPO_URL HEAD &>/dev/null"; then
    run_as_dev "git clone $REPO_URL $REPO_DIR"
    ok "Cloned to $REPO_DIR"
  else
    warn "Skipping clone — no GitHub auth available during provisioning."
    warn "Developers will clone the repo in their first session (GH_TOKEN is set per session via npdev setup)."
  fi
fi

# ─── Step 9: Install project dependencies ────────────────────────────────────
if [[ -d "$REPO_DIR/.git" ]]; then
  info "Installing project dependencies..."
  run_as_dev "cd $REPO_DIR && source ~/.bashrc && bun install" || warn "bun install had issues (may need manual intervention)"
  ok "Dependencies installed"
else
  info "Skipping dependency install (repo not cloned yet)"
fi

# ─── Step 10: Set up tmux session manager ─────────────────────────────────────
info "Setting up tmux session manager..."

mkdir -p "$VPS_DIR"

# Install tmux.conf
fallback_tmux_conf() {
  cat << 'TMUX_CONF'
# Shared VPS session persistence layer
source-file -q ~/.tmux.conf
set -g status off
set -g detach-on-destroy on
set -g extended-keys always
set -gs extended-keys-format csi-u
TMUX_CONF
}
install_file "server/tmux.conf" "$VPS_DIR/tmux.conf" fallback_tmux_conf

# Install session.sh
fallback_session_sh() {
  # In curl-pipe mode, fetch from GitHub
  curl -fsSL "https://raw.githubusercontent.com/kapitolph/npdev/main/server/session.sh"
}
install_file "server/session.sh" "$VPS_DIR/session.sh" fallback_session_sh

chmod +x "$VPS_DIR/session.sh"

# Install git credential helper (uses per-developer GH_TOKEN from env)
cat > "$VPS_DIR/git-credential-token" << 'CREDHELPER'
#!/bin/bash
# Git credential helper that uses GH_TOKEN from environment
if [[ -n "${GH_TOKEN:-}" ]]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=x-access-token"
  echo "password=${GH_TOKEN}"
fi
CREDHELPER
chmod +x "$VPS_DIR/git-credential-token"
run_as_dev "git config --global credential.helper '!bash ~/.vps/git-credential-token'"
ok "Git credential helper installed"

chown -R "$SHARED_USER:$SHARED_GROUP" "$VPS_DIR"

ok "Session manager installed at $VPS_DIR"

# ─── Step 11: Install TPM + tmux plugins ─────────────────────────────────────
info "Setting up tmux persistence (TPM + resurrect + continuum)..."

TPM_DIR="/home/$SHARED_USER/.tmux/plugins/tpm"
if [[ -d "$TPM_DIR/.git" ]]; then
  ok "TPM already installed"
else
  run_as_dev 'git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm'
  ok "TPM installed"
fi

# Install plugins non-interactively
run_as_dev '~/.tmux/plugins/tpm/bin/install_plugins' || warn "TPM plugin install had issues (may need tmux running)"
ok "Tmux plugins installed"

# ─── Step 12: Install Claude Code hooks ──────────────────────────────────────
info "Setting up Claude Code hooks..."

CLAUDE_HOOK_INSTALLER=""
if [[ -n "$REPO_ROOT" ]] && [[ -f "$REPO_ROOT/server/claude/install-hooks.sh" ]]; then
  CLAUDE_HOOK_INSTALLER="$REPO_ROOT/server/claude/install-hooks.sh"
else
  # Curl-pipe mode: fetch installer and hook from GitHub
  CLAUDE_HOOK_INSTALLER="/tmp/npdev-install-hooks.sh"
  curl -fsSL "https://raw.githubusercontent.com/kapitolph/npdev/main/server/claude/install-hooks.sh" -o "$CLAUDE_HOOK_INSTALLER"
  mkdir -p "/tmp/npdev-claude-hooks"
  curl -fsSL "https://raw.githubusercontent.com/kapitolph/npdev/main/server/claude/hooks/identify-developer.sh" -o "/tmp/npdev-claude-hooks/identify-developer.sh"
  # Patch script to use temp directory
  sed -i "s|SCRIPT_DIR=.*|SCRIPT_DIR=\"/tmp/npdev-claude\"|" "$CLAUDE_HOOK_INSTALLER"
  chmod +x "$CLAUDE_HOOK_INSTALLER"
fi

run_as_dev "bash $CLAUDE_HOOK_INSTALLER"
ok "Claude Code hooks installed"

# ─── Step 13: Configure dev user's shell PATH ────────────────────────────────
info "Configuring shell environment..."

BASHRC="/home/$SHARED_USER/.bashrc"
if ! grep -q '# dev-vps PATH setup' "$BASHRC" 2>/dev/null; then
  cat >> "$BASHRC" << 'BASHRC_APPEND'

# dev-vps PATH setup
export VOLTA_HOME="$HOME/.volta"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$VOLTA_HOME/bin:$HOME/.local/bin:$PATH"

# Convenience: end current tmux session
vps-end() {
  local session_name
  session_name=$(tmux display-message -p '#S' 2>/dev/null) || { echo "Not in a tmux session."; return 1; }
  bash ~/.vps/session.sh end "$session_name"
}
BASHRC_APPEND
  ok "PATH configured in .bashrc"
else
  ok "PATH already configured"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────
info "Setup complete!"
echo ""
echo "  Shared user:    $SHARED_USER"
echo "  Repository:     $REPO_DIR"
echo "  Session script: $VPS_DIR/session.sh"
echo "  Tmux config:    $VPS_DIR/tmux.conf"
echo ""
echo "  Next steps for each developer:"
echo "  1. Commit their public key to keys/<name>.pub in the repo"
echo "  2. Re-run this script to import new keys (or manually add to authorized_keys)"
echo "  3. Run client/setup.sh on their local machine"
echo ""
