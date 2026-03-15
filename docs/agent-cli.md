# Agent CLI Contract

`npdev` preserves the interactive TUI for humans, but agents and scripts should use the non-interactive command surface with `--json`.

## Compatibility Contract

- The non-interactive JSON surface is a compatibility boundary.
- Successful JSON payloads are command-specific and emitted on stdout.
- Failed `--json` invocations emit a shared JSON error object on stderr and exit with a deterministic code.
- Breaking JSON changes require versioning or explicit migration notes.

Shared error shape:

```json
{
  "ok": false,
  "error": {
    "code": "not_found",
    "message": "Summary not found: 3h-2026-03-15T06:55",
    "exit_code": 4,
    "details": {}
  }
}
```

Exit codes:

- `0`: success
- `1`: unexpected internal failure
- `2`: invalid arguments or unsupported combination
- `3`: missing local `npdev` configuration or identity
- `4`: requested resource not found
- `5`: operation completed but produced no new summary data
- `6`: remote SSH/VPS command failed
- `7`: remote data was malformed

## Discoverability

Use these commands instead of scraping `--help` text:

```bash
npdev spec --json
npdev spec command summaries get --json
npdev capabilities --json
```

## Summaries

The summaries surface reads and generates the existing VPS diary artifacts under `/home/dev/brain` and `/home/dev/heartbeat/diary`.

Supported windows:

- `3h`: rolling development log
- `daily`: end-of-day summary

Examples:

```bash
npdev summaries list --json
npdev summaries latest --json
npdev summaries get --id 3h-2026-03-15T06:55 --json
npdev summaries generate --window 3h --json
```

`npdev summaries generate --window 3h` runs the existing diary generator with `--since "3 hours ago" --label "Development Log"`.

`npdev summaries generate --window daily` runs the same generator with `--since "midnight" --label "End-of-Day Summary"`.

If no commits exist in the requested window, generation exits `5` with a JSON error code of `no_data`.

## Command Notes

- `npdev sessions --json`: array of active tmux sessions
- `npdev repos --json`: array of discovered git repositories
- `npdev repo <name|path> --json`: one repository object including sessions and commits
- `npdev status --json`: overview object with sessions, repos, and active users
- `npdev summaries list --json`: object with `items`
- `npdev summaries latest --json`: one summary object
- `npdev summaries get --id ... --json`: one summary object
- `npdev summaries generate --window ... --json`: object containing `summary` and raw generator `output`

## Non-Interactive Usage Rules

- Pass `--machine <name>` if multiple VPS machines are configured.
- Do not rely on prompt text or TUI rendering.
- Prefer `spec` and `capabilities` for command discovery.
