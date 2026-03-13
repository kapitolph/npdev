# Server Administration

## Provisioning a VPS

```bash
# From repo checkout:
sudo bash server/setup.sh

# Or curl-pipe (standalone):
curl -fsSL https://raw.githubusercontent.com/kapitolph/npdev/main/server/setup.sh | sudo bash
```

`setup.sh` is idempotent — safe to re-run. It:
- Creates a shared `dev` user and `developers` group
- Imports SSH keys from `keys/*.pub` (repo checkout) or existing system users (curl-pipe)
- Installs Bun, Volta, Node.js, Claude Code, Codex CLI
- Authenticates with GitHub (interactive)
- Clones the project repo to `~/nextpay`
- Installs the tmux session manager, config, and TPM persistence plugins

## Adding a Machine

Add an entry to `machines.yaml` in the repo root:

```yaml
machines:
  - name: np-dev-2
    host: 1.2.3.4
    user: dev
    description: "Secondary dev VPS"
```

Then run `sudo bash server/setup.sh` on the new VPS.

## Architecture

```
server/
├── setup.sh        # Idempotent VPS provisioner
├── session.sh      # Tmux session manager (installed to ~/.vps/)
└── tmux.conf       # Tmux config with resurrect+continuum (installed to ~/.vps/)
```

## Session Manager

The session manager runs on the VPS at `~/.vps/session.sh`. It's called by `npdev` over SSH — you rarely need to use it directly.

| Command | Description |
|---|---|
| `session.sh start <name> <type> [desc]` | Create and attach to a session (`shell`, `claude`, `codex`) |
| `session.sh end <name>` | Kill a session |
| `session.sh list` | List active sessions + registry |
| `session.sh describe <name> <desc>` | Update session description |
| `session.sh reconcile` | Clean up stale registry entries |
| `session.sh registry` | Dump raw registry YAML |

## Tmux Configuration

`tmux.conf` includes:
- Vim-style navigation (`h/j/k/l`), mouse support, 50K scrollback
- Minimal status bar showing session name (important for multi-user visibility)
- tmux-resurrect + tmux-continuum for session persistence across reboots
- TPM (Tmux Plugin Manager) for plugin management

## Manually Adding a Developer's Key

If `npdev sync-keys` isn't available:

```bash
echo 'ssh-ed25519 AAAA...' >> /home/dev/.ssh/authorized_keys
```
