# cxp — Codex CLI Profile shell integration
# Sourced by .bashrc. Installed by: npdev install cxp

alias codex-profile="bash $HOME/.vps/codex-profile.sh"
alias cxp="bash $HOME/.vps/codex-profile.sh"

_cxp_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"
  case "$prev" in
    cxp|codex-profile)
      COMPREPLY=( $(compgen -W "list use switch next login logout save whoami help" -- "$cur") )
      ;;
    use|switch|login|save|logout)
      local devs=$(ls ~/.vps/developers/*.env 2>/dev/null | xargs -I{} basename {} .env)
      COMPREPLY=( $(compgen -W "$devs" -- "$cur") )
      ;;
  esac
}
complete -F _cxp_completions cxp codex-profile
