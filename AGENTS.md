# dev-vps: Agent Context

Shared VPS pair programming system. All developers SSH as a single shared user (`dev`) and collaborate via named tmux sessions.

## Architecture

```
Client (engineer's machine)          VPS (shared dev server)
─────────────────────────────        ─────────────────────────────
~/.local/bin/npdev (compiled bin)    ~/.vps/session.sh
~/.npdev/config (NPDEV_USER)         ~/.vps/tmux.conf
~/.npdev/machines.yaml               ~/.vps/sessions.yaml (registry)
~/.ssh/vps/id_<name>_ed25519         ~/.vps/developers/<name>.env
                                     ~/.vps/git-credential-token
                                     ~/.vps/hooks/notify-attach.sh
                                     ~/.claude/hooks/identify-developer.sh
                                     ~/.claude/hooks/update-session-desc.sh
```

### Client (`client/`)

| File | Purpose |
|------|---------|
| `client/npdev` | Legacy bash CLI (kept for fallback). |
| `client/interactive/` | Bun/TypeScript interactive CLI. Compiled to standalone binary via `bun build --compile`. |
| `client/interactive/src/index.ts` | Entry point: arg parsing → dashboard or subcommand dispatch. Handles `npdev -` (resume last), `npdev .` (branch session), first-run inline setup, VPS-native detection. |
| `client/interactive/src/commands/` | One file per command: start, end, sessions, shell, setup, update, sync-keys. |
| `client/interactive/src/lib/` | Shared modules: ssh (VPS-aware), config (with `isOnVPS()`), machine selection, version check, sessions (fetchSessions, relativeTime, activityAge). |
| `client/interactive/src/ui/menu.ts` | Smart dashboard: shows own sessions, team sessions grouped by owner, attachment counts, stale nudge, resume as default action. |
| `client/interactive/src/ui/welcome.ts` | Legacy welcome banner (no longer imported, kept for reference). |
| `client/interactive/build.sh` | Cross-platform `bun build --compile` (linux-x64, darwin-arm64, darwin-x64). |
| `client/setup.sh` | Idempotent installer. Downloads compiled binary from GitHub releases (falls back to bash script). |

### Server (`server/`)

| File | Purpose |
|------|---------|
| `server/setup.sh` | Idempotent VPS provisioner. Requires `sudo`. Installs bun, volta, node, claude code, codex, gh, tmux + TPM, tmux notification hooks, Claude Code hooks. |
| `server/session.sh` | Tmux session manager. Handles start/end/list/describe/reconcile/session-data. Sources per-developer env on session start. `session-data` returns JSON with name/type/description/owner/created_at/last_activity/client_count for active sessions. Supports `switch-client` when already inside tmux. |
| `server/tmux.conf` | Tmux config with vim nav, mouse, 50K scrollback, resurrect + continuum persistence, client-attached/detached notification hooks. |
| `server/hooks/notify-attach.sh` | Tmux hook: walks `/proc` PID tree to identify developer by `GIT_AUTHOR_NAME`, displays attach/detach notification in session. |
| `server/claude/install-hooks.sh` | Installs Claude Code hooks (SessionStart: identify-developer, Stop: update-session-desc). Idempotent, merges into existing settings.json. |
| `server/claude/hooks/identify-developer.sh` | Claude Code SessionStart hook: identifies developer from process environment. |
| `server/claude/hooks/update-session-desc.sh` | Claude Code Stop hook: updates tmux session description with latest git commit message. |
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
- **Self-contained client**: After `npdev update` or `client/setup.sh`, the repo clone is not needed. `npdev` is a compiled Bun binary with interactive dashboard (via @clack/prompts).
- **Version check**: On every run, `npdev` checks GitHub for a newer version and warns the user.
- **Smart dashboard**: Running `npdev` with no args on a TTY shows a context-aware dashboard with own sessions (resume as default), team sessions grouped by owner, attachment counts, and stale session cleanup. Non-TTY falls back to quick shell.
- **VPS-native mode**: When `~/.vps` exists, `npdev` runs commands locally (no SSH to self) and uses `tmux switch-client` instead of `attach-session` when already inside tmux.
- **Shortcuts**: `npdev -` resumes the most recent own session. `npdev .` creates/attaches a session named after the current git branch.
- **First-run inline setup**: If `NPDEV_USER` is not set, `npdev` launches setup interactively instead of showing an error.
- **`setup.sh` dual mode**: Detects repo checkout vs curl-pipe via `SCRIPT_DIR`. Falls back to inline heredocs or GitHub raw fetch when no repo is available.

## Release & Auto-Versioning

- **Trigger**: Push to `main` with changes in `client/interactive/src/**` or `.github/workflows/release.yml`
- **CI workflow** (`.github/workflows/release.yml`):
  1. Auto-increments patch version in `client/interactive/src/lib/version.ts`
  2. Builds 3 binaries: `npdev-linux-x64`, `npdev-darwin-arm64`, `npdev-darwin-x64`
  3. Commits version bump with `[skip ci]` to avoid loop
  4. Creates GitHub release with tag `v<version>` and uploads binaries
- **No manual version bumping needed** — CI handles it
- Server-only changes (files outside `client/interactive/src/`) don't trigger a release
- Users get updates via `npdev update`

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

`session.sh start <name> <type> [desc] [dev_user]` — `dev_user` is stored as `owner` in the registry.

| Type | Command run in tmux |
|------|---------------------|
| `shell` | `cd $work_dir && exec $SHELL -l` |
| `claude` | `cd $work_dir && claude --dangerously-skip-permissions` |
| `codex` | `cd $work_dir && codex --dangerously-bypass-approvals-and-sandbox` |

The `npdev` CLI currently only creates `shell` sessions. `claude` and `codex` types are available via direct `session.sh` invocation on the VPS.

## CLI Commands

| Command | Description |
|---------|-------------|
| `npdev` | Interactive dashboard (TTY) or quick shell (non-TTY) |
| `npdev <name> [desc]` | Create or attach to named session |
| `npdev -` | Resume most recent own session |
| `npdev .` | Session from current git branch name |
| `npdev list` | List sessions (grouped: Active/Idle/Stale) |
| `npdev end <name>` | End a session |
| `npdev setup` | Configure developer identity |
| `npdev sync-keys` | Sync SSH keys from repo to VPS |
| `npdev update` | Update binary + machines from GitHub |
| `--machine <name>` | Select VPS (when multiple configured) |
| `--user <name>` | Override developer identity |

## Gotchas & Pitfalls

- **tmux.conf version guards**: `extended-keys-format` requires tmux 3.5+. Use `if-shell` with version check. The VPS currently runs tmux 3.4.
- **TPM guard**: `run-shell ~/.tmux/plugins/tpm/tpm` must be wrapped in `if-shell 'test -f ...'` or it kills the tmux server when TPM isn't installed.
- **`$REPO_DIR` fallback**: `session.sh` must fall back to `$HOME` when `~/nextpay` doesn't exist. Without this, `cd` fails and the tmux session dies instantly.
- **Non-interactive SSH**: Doesn't load `.bashrc`. Scripts must set PATH explicitly: `PATH="$HOME/.bun/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"`.
- **GitHub raw CDN**: Caches for several minutes after push. `npdev update` right after pushing may fetch stale content.
- **`gh auth status` false alarm**: Newer `gh` versions report classic `ghp_` tokens as invalid via `gh auth status`, but the token works fine for git operations and API calls. Test with `curl -H "Authorization: token $GH_TOKEN" https://api.github.com/user` instead.
- **Never use `gh repo clone` on the VPS**: `gh repo clone` embeds the developer's token in the remote URL (`https://x-access-token:<token>@github.com/...`). This bakes one person's credentials into the repo for everyone. Always use `git clone https://github.com/...` — the credential helper will inject the correct per-developer token automatically. If a repo already has an embedded token, fix with: `git remote set-url origin https://github.com/<org>/<repo>.git`
- **Per-developer gitconfig isolation**: `session.sh` creates `~/.vps/developers/<name>.gitconfig` per developer and sets `GIT_CONFIG_GLOBAL` env var. This prevents concurrent sessions from overwriting each other's `git config` identity. Never run `git config --global user.name/email` directly on the VPS — it pollutes all sessions.
- **Stale sessions don't get identity**: Sessions created before the identity system was added won't have env vars or gitconfig set. Must `npdev end <name>` and recreate.
- **GitHub raw CDN delays deployment**: After pushing, `curl` from `raw.githubusercontent.com` may fetch stale content for several minutes. Use `scp` to deploy server files directly instead of fetching from GitHub.
- **`sed -i` portability**: `sed -i` (no backup suffix) works on Linux (GNU sed) but not macOS (BSD sed). Server scripts run on Linux VPS only. Client scripts avoid `sed -i`.
- **YAML parsing**: `machines.yaml` and `sessions.yaml` are parsed with `awk`, not a YAML library. Keep the structure flat — no nested objects, no multi-line strings.
- **No global git identity on VPS**: Git identity is per-session via developer env files. Running git commands outside a session (e.g. bare SSH) requires sourcing `~/.vps/developers/<name>.env` first.
- **`isOnVPS()` detection**: Uses `existsSync("~/.vps")`. When true, SSH functions run commands locally via `bash -c` instead of over SSH, and `tmux switch-client` is used instead of `attach-session`.

## Development Workflow

### Making Changes

1. Edit files in the repo.
2. **Do NOT manually bump `NPDEV_VERSION`** — CI auto-increments it on push to main.
3. **Update `server/setup.sh`** if changing anything server-side — it's the canonical provisioner and should stay in sync with manual changes.
4. **Update this `AGENTS.md`** if changing architecture, adding files, or discovering new gotchas.
5. Commit and push. CI will build, version, and release automatically if client source changed.
6. If server files changed, deploy directly via `scp` (avoids GitHub CDN caching): `scp server/session.sh dev@<host>:~/.vps/session.sh` and `scp server/tmux.conf dev@<host>:~/.vps/tmux.conf`. For full re-provisioning: `scp -r server/ dev@<host>:/tmp/dev-vps-server && ssh dev@<host> "sudo bash /tmp/dev-vps-server/setup.sh"`
7. If client files changed, users run `npdev update` (they'll be warned automatically by the version check).

### Testing

- **Syntax check**: `bash -n server/setup.sh && bash -n server/session.sh && bash -n client/npdev && bash -n client/setup.sh`
- **TypeScript check**: `cd client/interactive && bun build src/index.ts --target=bun --outfile /dev/null`
- **Compile binary**: `cd client/interactive && bash build.sh`
- **Session test** (needs terminal): `ssh -t dev@<host> "bash ~/.vps/session.sh start test-session shell 'test' don"` then `Ctrl+B, D` to detach, `bash ~/.vps/session.sh end test-session` to clean up.
- **Non-interactive test**: `ssh dev@<host> 'source ~/.vps/developers/don.env && echo "$GIT_AUTHOR_NAME" && git clone https://github.com/kapitolph/nextpay-v3.git /tmp/test && rm -rf /tmp/test'`

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
- [ ] `server/setup.sh` reflects any new server-side state
- [ ] `AGENTS.md` updated with new context
- [ ] `README.md` updated if CLI commands or user-facing behavior changed
