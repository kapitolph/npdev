#!/usr/bin/env bash
# Deterministically identifies the current developer from the tmux session environment.
# Outputs context for Claude Code so it knows who it's working with and how to auth.

DEV_NAME="${GIT_AUTHOR_NAME:-}"
DEV_EMAIL="${GIT_AUTHOR_EMAIL:-}"
ENV_FILE="$HOME/.vps/developers/${DEV_NAME}.env"

if [[ -z "$DEV_NAME" ]]; then
  echo "WARNING: No developer identity found (GIT_AUTHOR_NAME not set). Run: npdev setup"
  exit 0
fi

# Re-source the developer env to pick up any token refreshes since session start
if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
  export GH_TOKEN
fi

cat <<EOF
Current developer: ${DEV_NAME} <${DEV_EMAIL}>
Developer env: ${ENV_FILE}
GitHub auth: $(gh auth status 2>&1 | grep -oP 'account \K\S+' || echo "not authenticated")

When running git or gh commands, credentials are already in the environment — no need to manually source anything.
EOF
