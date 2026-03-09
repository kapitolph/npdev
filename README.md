# nextpay-dev-vps

Shared VPS setup for pair programming via tmux. One repo provisions servers and configures developer clients.

## Quick Start

### Server (run once per VPS)

```bash
# From repo checkout:
sudo bash server/setup.sh

# Or curl-pipe (standalone):
curl -fsSL https://raw.githubusercontent.com/kapitolph/nextpay-dev-vps/main/server/setup.sh | sudo bash
```

### Client (each developer)

Paste this into your coding agent (Claude Code, Codex, Cursor, etc.):

```
Clone https://github.com/kapitolph/nextpay-dev-vps.git then read
client/client-prompt.md and walk me through the setup step by step.
```

<details>
<summary>Manual setup (without an agent)</summary>

```bash
git clone https://github.com/kapitolph/nextpay-dev-vps.git
cd nextpay-dev-vps
bash client/setup.sh
# Then: generate SSH key, configure ~/.ssh/config, commit key to keys/<name>.pub
```

See `client/client-prompt.md` for the full step-by-step guide.
</details>

## Architecture

```
nextpay-dev-vps/
├── machines.yaml              # VPS registry (name, host, user)
├── keys/                      # One .pub file per engineer
├── server/
│   ├── setup.sh               # Idempotent VPS provisioner
│   ├── session.sh             # Tmux session manager
│   └── tmux.conf              # Tmux config with persistence
└── client/
    ├── npdev                  # CLI script
    ├── setup.sh               # Client installer
    └── client-prompt.md       # Agent-readable onboarding prompt
```

### How Pair Programming Works

All developers SSH as a shared user. The tmux session manager lets multiple people attach to the same named session:

```bash
# Developer A:
npdev feature-auth             # Creates a tmux session called "feature-auth"

# Developer B:
npdev feature-auth             # Joins the SAME terminal — live pair programming
```

Detach without killing the session: `Ctrl+B, D`

## Adding a Machine

Add an entry to `machines.yaml`:

```yaml
machines:
  - name: np-dev-2
    host: 1.2.3.4
    user: dev
    description: "Secondary dev VPS"
```

Then provision: `sudo bash server/setup.sh` on the new VPS.

## Adding a Developer

1. Developer runs through `client/client-prompt.md` (or manual setup)
2. They commit their public key to `keys/<name>.pub`
3. Admin re-runs `sudo bash server/setup.sh` on each VPS to import the key
   (or manually: `echo '<key>' >> /home/dev/.ssh/authorized_keys`)

## CLI Reference

| Command | Description |
|---|---|
| `npdev` | Quick shell (no tmux session) |
| `npdev <name> [desc]` | Create or attach to named session |
| `npdev list` | List all sessions |
| `npdev end <name>` | End a session |
| `npdev --machine <name>` | Select VPS (when multiple configured) |
| `npdev --version` | Show version |
| `npdev --help` | Full usage |

## Session Commands (on server)

The session manager at `~/.vps/session.sh` supports: `start`, `end`, `list`, `describe`, `reconcile`, `registry`.
