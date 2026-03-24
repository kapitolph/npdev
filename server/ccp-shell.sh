# ccp — Claude Code Profile shell integration
# Sourced by .bashrc. Installed by: npdev install ccp

alias claude-profile="bash $HOME/.vps/claude-profile.sh"

ccp() {
  bash "$HOME/.vps/claude-profile.sh" "$@"
  case "${1:-}" in
    list|whoami|help|-h|--help) ;;  # read-only — skip re-export
    *)
      if [[ -f "$HOME/.claude/.active-token" ]]; then
        export CLAUDE_CODE_OAUTH_TOKEN="$(cat "$HOME/.claude/.active-token")"
      else
        unset CLAUDE_CODE_OAUTH_TOKEN
      fi
      ;;
  esac
}

_ccp_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"
  case "$prev" in
    ccp|claude-profile)
      COMPREPLY=( $(compgen -W "list use switch next login import save logout whoami help" -- "$cur") )
      ;;
    use|switch|login|save|logout)
      local devs=$(ls ~/.vps/developers/*.env 2>/dev/null | xargs -I{} basename {} .env)
      COMPREPLY=( $(compgen -W "$devs" -- "$cur") )
      ;;
  esac
}
complete -F _ccp_completions ccp claude-profile
