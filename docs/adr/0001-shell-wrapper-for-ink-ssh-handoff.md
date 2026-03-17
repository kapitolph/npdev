# 0001. Shell wrapper for Ink-to-SSH handoff

**Date**: 2026-03-15
**Status**: proposed

## Context

npdev is a compiled Bun binary that renders an Ink (React) TUI dashboard. When the user selects a tmux session, Ink unmounts and the process spawns `ssh -t` as a child to connect to the VPS.

After Ink unmounts, Bun's event loop continues polling the stdin file descriptor. Both Bun and the SSH child process contend for the same TTY input, causing:
- Dropped keystrokes during normal typing
- Truncated or garbled paste (characters missing from beginning/end)
- Terminal freezes requiring a session restart

This does **not** occur with `npdev --old` (which uses @clack/prompts instead of Ink and never enters React/raw mode), nor when SSH'ing directly and manually running `tmux attach`.

Three incremental fixes were attempted and all failed:
1. **Terminal escape sequences** (`\x1B[?1000l`, `\x1Bc` RIS reset) after Ink unmount — Bun's event loop still polls stdin
2. **`stty sane`** in the child shell before SSH — resets line discipline but doesn't stop Bun's polling
3. **`exec < /dev/tty`** to bypass Bun's stdin fd entirely — on macOS, `/dev/tty` still resolves to the same underlying terminal; Bun continues interfering

The root cause is architectural: you cannot fully quiesce Bun's internal I/O subsystem from JavaScript userland once Ink has activated raw stdin reading. The Bun process must not be alive when SSH runs.

## Decision

Split npdev into two files:
- **`~/.npdev/bin/npdev-core`** — the compiled Bun binary (TUI, config, all logic)
- **`~/.local/bin/npdev`** — a thin shell wrapper script

The handoff protocol:
1. Wrapper sets `NPDEV_EXEC_FILE=/tmp/npdev-exec-$$` and runs `npdev-core`
2. When `npdev-core` needs to hand off to SSH, it writes the shell command to `$NPDEV_EXEC_FILE` and calls `process.exit(10)`
3. Wrapper detects exit code 10, reads the file, cleans it up, and `exec`s the command
4. The `exec` replaces the wrapper shell with SSH — clean PID, clean TTY, zero Bun interference

When `NPDEV_EXEC_FILE` is not set (e.g., running on the VPS locally, or invoking the binary directly), `sshInteractive()` falls back to `Bun.spawn` as before.

### Alternatives considered

- **`Bun.spawnSync`**: Blocks the event loop so it can't interfere, but Bun's spawnSync doesn't support `stdin: "inherit"` for interactive TTY processes — it creates pipes instead.
- **Bun FFI to call `execvp`**: Would replace the process entirely, but adds native code complexity, platform-specific handling, and fragility across Bun versions.
- **`process.stdin.destroy()`**: Doesn't reliably close the underlying libuv handle in Bun's implementation.

## Consequences

**Positive:**
- Definitively eliminates the stdin contention bug — the Bun process is gone before SSH starts
- Same pattern used by nvm, pyenv, volta for similar "runtime must not outlive handoff" problems
- Wrapper is tiny (~10 lines), easy to audit and debug
- No changes to CI or binary naming — the build still produces `npdev-{platform}`, renaming happens at install time

**Negative:**
- Distribution goes from 1 file to 2 files (binary + wrapper)
- `npdev update` and `setup.sh` need to manage both files
- First update from old single-binary layout requires a migration path (binary overwrites itself with wrapper, writes core to new location)
- Direct invocation of `npdev-core` bypasses the wrapper (acceptable — only affects developers running the binary manually)
