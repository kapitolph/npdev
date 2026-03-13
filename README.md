# dev-vps

Shared VPS for pair programming via tmux.

## Getting Started

Paste this into your coding agent (Claude Code, Codex, Cursor, etc.):

```
Clone https://github.com/kapitolph/npdev.git then read
client/AGENTS.md and walk me through the setup step by step.
```

<details>
<summary>Manual setup (without an agent)</summary>

```bash
# Install npdev (no repo clone needed):
curl -fsSL https://raw.githubusercontent.com/kapitolph/npdev/main/client/setup.sh | bash

# Then: generate SSH key, configure ~/.ssh/config, commit key to keys/<name>.pub
# See client/AGENTS.md for the full step-by-step guide.
```
</details>

## How Pair Programming Works

All developers SSH as a shared user. The tmux session manager lets multiple people attach to the same named session:

```bash
# Developer A:
npdev feature-auth             # Creates a tmux session called "feature-auth"

# Developer B:
npdev feature-auth             # Joins the SAME terminal — live pair programming
```

Detach without killing the session: `Ctrl+B, D`

## CLI Reference

| Command | Description |
|---|---|
| `npdev` | Interactive menu (or quick shell if not a TTY) |
| `npdev <name> [desc]` | Create or attach to named session |
| `npdev list` | List all sessions |
| `npdev end <name>` | End a session |
| `npdev sync-keys` | Sync `keys/*.pub` from GitHub to VPS `authorized_keys` |
| `npdev update` | Update npdev binary + machines config from GitHub |
| `npdev setup` | Set up developer identity (git + GitHub token) |
| `npdev --machine <name>` | Select VPS (when multiple configured) |
| `npdev --version` | Show version |
| `npdev --help` | Full usage |

The interactive menu (run `npdev` with no args) also includes session cleanup — interactively select and end old sessions, with a filter for your own vs all sessions.

## Adding a Developer

1. New developer runs through the Getting Started prompt above
2. They commit their public key to `keys/<name>.pub` and push
3. Any existing developer syncs the key to the VPS: `npdev sync-keys`

## Server Administration

See [server/README.md](server/README.md) for provisioning VPSes, adding machines, and server-side session management.
