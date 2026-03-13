#!/usr/bin/env bash
# Claude Code Stop hook — updates the current tmux session's description
# with the latest git commit message as a proxy for recent work.

SESSION_NAME=$(tmux display-message -p '#{session_name}' 2>/dev/null) || true
[[ -z "$SESSION_NAME" ]] && exit 0

# Get the working directory of the active pane
PANE_PATH=$(tmux display-message -p '#{pane_current_path}' 2>/dev/null) || true
[[ -z "$PANE_PATH" ]] && exit 0

# Get most recent commit message (if in a git repo)
DESC=$(git -C "$PANE_PATH" log --oneline -1 2>/dev/null) || true
[[ -z "$DESC" ]] && exit 0

# Truncate to 120 chars
DESC="${DESC:0:120}"

bash ~/.vps/session.sh describe "$SESSION_NAME" "$DESC"
