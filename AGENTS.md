# dev-vps: Agent Context

Shared VPS pair programming system. All developers SSH as a single shared user (`dev`) and collaborate via named tmux sessions.

## Architecture

```
Client (engineer's machine)          VPS (shared dev server)
─────────────────────────────        ─────────────────────────────
~/.local/bin/npdev                   ~/.vps/session.sh
~/.npdev/config (NPDEV_USER)         ~/.vps/tmux.conf
~/.npdev/machines.yaml               ~/.vps/sessions.yaml (registry)
~/.ssh/vps/id_<name>_ed25519         ~/.vps/developers/<name>.env
                                     ~/.vps/git-credential-token
```

### Client (`client/`)

| File | Purpose |
|------|---------|
| `client/npdev` | Self-contained CLI. Installed to `~/.local/bin/npdev`. Self-updates via `npdev update` (fetches from GitHub raw). |
| `client/setup.sh` | Idempotent installer. Copies `npdev` + `machines.yaml` to `~/.npdev/`. Works via curl-pipe or repo checkout. |
| `client/AGENTS.md` | Agent-readable onboarding walkthrough for new developers. |

### Server (`server/`)

| File | Purpose |
|------|---------|
| `server/setup.sh` | Idempotent VPS provisioner. Requires `sudo`. Installs bun, volta, node, claude code, codex, gh, tmux + TPM. |
| `server/session.sh` | Tmux session manager. Handles start/end/list/reconcile. Sources per-developer env on session start. |
| `server/tmux.conf` | Tmux config with vim nav, mouse, 50K scrollback, resurrect + continuum persistence. |
| `server/README.md` | Admin docs for provisioning and server-side operations. |

### Root

| File | Purpose |
|------|---------|
| `machines.yaml` | VPS registry. Parsed by `npdev` via `awk`. One machine = auto-select, multiple = interactive prompt or `--machine` flag. |
| `keys/*.pub` | One SSH public key per engineer. Synced to VPS `authorized_keys` via `npdev sync-keys` or `server/setup.sh`. |

## Key Design Decisions

- **Single shared user (`dev`)**: Enables tmux session sharing. Two devs running `npdev feature-x` attach to the same terminal.
- **Per-developer identity**: `~/.vps/developers/<name>.env` sets `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`, `GH_TOKEN`. Sourced by `session.sh` at session start.
- **Git credential helper**: `~/.vps/git-credential-token` reads `GH_TOKEN` from the session environment and passes it to git for HTTPS auth. Configured via `git config --global credential.helper`.
- **Self-contained client**: After `npdev update` or `client/setup.sh`, the repo clone is not needed. `npdev` fetches everything from GitHub raw.
- **Version check**: On every run (cached 1hr), `npdev` checks GitHub for a newer version and warns the user.
- **`setup.sh` dual mode**: Detects repo checkout vs curl-pipe via `SCRIPT_DIR`. Falls back to inline heredocs or GitHub raw fetch when no repo is available.

## VPS Toolchain

Installed by `server/setup.sh` on the shared `dev` user:

| Tool | Path | Notes |
|------|------|-------|
| bun | `~/.bun/bin/bun` | JS runtime |
| volta | `~/.volta/` | Node version manager |
| node | via volta | |
| claude code | via npm (volta) | Alias `cc` = `claude --dangerously-skip-permissions` |
| codex | via npm (volta) | |
| gh | system (`/usr/bin/gh`) | GitHub CLI, installed via apt |
| tmux | system | With TPM, tmux-resurrect, tmux-continuum |

## Session Types

`session.sh start <name> <type> [desc] [dev_user]`

| Type | Command run in tmux |
|------|---------------------|
| `shell` | `cd $work_dir && exec $SHELL -l` |
| `claude` | `cd $work_dir && claude --dangerously-skip-permissions` |
| `codex` | `cd $work_dir && codex --dangerously-bypass-approvals-and-sandbox` |

The `npdev` CLI currently only creates `shell` sessions. `claude` and `codex` types are available via direct `session.sh` invocation on the VPS.

## Gotchas & Pitfalls

- **tmux.conf version guards**: `extended-keys-format` requires tmux 3.5+. Use `if-shell` with version check. The VPS currently runs tmux 3.4.
- **TPM guard**: `run-shell ~/.tmux/plugins/tpm/tpm` must be wrapped in `if-shell 'test -f ...'` or it kills the tmux server when TPM isn't installed.
- **`$REPO_DIR` fallback**: `session.sh` must fall back to `$HOME` when `~/nextpay` doesn't exist. Without this, `cd` fails and the tmux session dies instantly.
- **Non-interactive SSH**: Doesn't load `.bashrc`. Scripts must set PATH explicitly: `PATH="$HOME/.bun/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"`.
- **GitHub raw CDN**: Caches for several minutes after push. `npdev update` right after pushing may fetch stale content.
- **`gh auth status` false alarm**: Newer `gh` versions report classic `ghp_` tokens as invalid via `gh auth status`, but the token works fine for git operations and API calls. Test with `curl -H "Authorization: token $GH_TOKEN" https://api.github.com/user` instead.
- **`sed -i` portability**: `sed -i` (no backup suffix) works on Linux (GNU sed) but not macOS (BSD sed). Server scripts run on Linux VPS only. Client scripts avoid `sed -i`.
- **YAML parsing**: `machines.yaml` and `sessions.yaml` are parsed with `awk`, not a YAML library. Keep the structure flat — no nested objects, no multi-line strings.

## Development Workflow

### Making Changes

1. Edit files in the repo.
2. **Bump `NPDEV_VERSION`** in `client/npdev` if changing the client (triggers update warnings for users on older versions).
3. **Update `server/setup.sh`** if changing anything server-side — it's the canonical provisioner and should stay in sync with manual changes.
4. **Update this `AGENTS.md`** if changing architecture, adding files, or discovering new gotchas.
5. Commit and push.
6. If server files changed, re-run setup on the VPS: `ssh dev@<host> "cd /tmp && rm -rf dev-vps && git clone https://github.com/kapitolph/dev-vps.git && sudo bash dev-vps/server/setup.sh"`
7. If client files changed, users run `npdev update` (they'll be warned automatically by the version check).

### Testing

- **Syntax check**: `bash -n server/setup.sh && bash -n server/session.sh && bash -n client/npdev && bash -n client/setup.sh`
- **Session test** (needs terminal): `ssh -t dev@<host> "bash ~/.vps/session.sh start test-session shell 'test' don"` then `Ctrl+B, D` to detach, `bash ~/.vps/session.sh end test-session` to clean up.
- **Non-interactive test**: `ssh dev@<host> 'source ~/.vps/developers/don.env && echo "$GIT_AUTHOR_NAME" && git clone https://github.com/kapitolph/nextpay-v3.git /tmp/test && rm -rf /tmp/test'`
- **Version check test**: Temporarily set `NPDEV_VERSION="0.0.1"` locally, run any `npdev` command, and verify the warning appears.

### Adding a New Machine

1. Add entry to `machines.yaml`:
   ```yaml
     - name: np-dev-2
       host: <ip>
       user: dev
       description: "Description"
   ```
2. Run `server/setup.sh` on the new machine (via SSH or curl-pipe).
3. Commit and push. Users pick it up via `npdev update`.

### Self-Update Checklist

After any change, verify:
- [ ] `NPDEV_VERSION` bumped (if client changed)
- [ ] `server/setup.sh` reflects any new server-side state
- [ ] `AGENTS.md` updated with new context
- [ ] `client/AGENTS.md` updated if onboarding flow changed
- [ ] `README.md` updated if CLI commands or user-facing behavior changed
