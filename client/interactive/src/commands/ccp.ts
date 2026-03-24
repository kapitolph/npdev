import { existsSync } from "node:fs";
import { join } from "node:path";
import { scpUpload, sshExec, sshExecWithInput, sshInteractive } from "../lib/ssh";
import { isOnVPS } from "../lib/config";
import type { Machine } from "../types";

const REMOTE_SCRIPT = "~/.vps/claude-profile.sh";

async function ensureScript(machine: Machine): Promise<void> {
  const localPath = join(import.meta.dir, "../../../../server/claude-profile.sh");
  if (existsSync(localPath)) {
    // Running from source — sync script to VPS
    const result = await scpUpload(machine, localPath, "/home/dev/.vps/claude-profile.sh");
    if (result.exitCode !== 0) throw new Error(`Failed to sync ccp: ${result.error}`);
    await sshExec(machine, `chmod +x ${REMOTE_SCRIPT}`);
  } else {
    // Compiled binary — just verify script exists on VPS
    const { exitCode } = await sshExec(machine, `test -f ${REMOTE_SCRIPT}`);
    if (exitCode !== 0) throw new Error("ccp script not found on VPS. Run 'npdev install ccp' on the VPS.");
  }
}

// ─── Local login flow ─────────────────────────────────────────────────────────

async function localOAuthLogin(
  machine: Machine,
  name: string,
  _email: string | undefined,
): Promise<void> {
  await ensureScript(machine);

  // 1. Validate developer exists on VPS
  const { exitCode: devCheck } = await sshExec(
    machine,
    `test -f ~/.vps/developers/'${name}'.env`,
  );
  if (devCheck !== 0) {
    console.error(`ERROR: Developer '${name}' is not registered on the VPS.`);
    process.exit(1);
  }

  // 2. Run `claude setup-token` and capture the long-lived token from stdout
  console.log("Running claude setup-token (browser will open)...");
  const loginProc = Bun.spawn(["claude", "setup-token"], {
    stdout: "pipe",
    stderr: "inherit",
    stdin: "inherit",
  });

  const output = await new Response(loginProc.stdout).text();
  const loginExit = await loginProc.exited;

  // Print output so user sees the flow
  process.stdout.write(output);

  if (loginExit !== 0) {
    console.error("claude setup-token failed.");
    process.exit(1);
  }

  // 3. Extract the sk-ant-oat01-... token from output
  const tokenMatch = output.match(/sk-ant-oat01-[A-Za-z0-9_-]+/);
  if (!tokenMatch) {
    console.error("ERROR: Could not find long-lived token in setup-token output.");
    process.exit(1);
  }

  const token = tokenMatch[0];
  console.log("\nSending token to VPS...");

  // 4. Send token to VPS via ccp login --token
  await localTokenLogin(machine, name, token);
}

async function localTokenLogin(
  machine: Machine,
  name: string,
  token: string,
): Promise<void> {
  await ensureScript(machine);

  // Validate developer exists on VPS
  const { exitCode: devCheck } = await sshExec(
    machine,
    `test -f ~/.vps/developers/'${name}'.env`,
  );
  if (devCheck !== 0) {
    console.error(`ERROR: Developer '${name}' is not registered on the VPS.`);
    process.exit(1);
  }

  // Build minimal credentials JSON and send via import
  const nowMs = Date.now();
  const expiresAt = nowMs + 365 * 86400 * 1000; // 1 year (setup-token tokens)
  const payload = JSON.stringify({
    credentials: {
      claudeAiOauth: {
        accessToken: token,
        refreshToken: "",
        expiresAt,
      },
    },
    account: {
      oauthAccount: {},
    },
  });

  const escaped = `'${name.replace(/'/g, "'\\''")}'`;
  const importCmd = `bash ${REMOTE_SCRIPT} import ${escaped}`;
  const { stdout, exitCode } = await sshExecWithInput(machine, importCmd, payload);

  if (exitCode !== 0) {
    console.error("ERROR: Failed to import token to VPS.");
    process.exit(1);
  }

  if (stdout) console.log(stdout);
  console.log(`\nRun 'ccp use ${name}' on VPS to activate.`);
}

// ─── Command entrypoint ───────────────────────────────────────────────────────

export async function cmdCcp(
  machine: Machine,
  subArgs: string[],
  opts: { json?: boolean },
): Promise<void> {
  // Intercept `login` subcommand — run locally instead of forwarding to VPS
  if (subArgs[0] === "login" && !isOnVPS()) {
    const args = subArgs.slice(1);

    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
      console.log(`npdev ccp login — Authenticate to Claude and save credentials to VPS

Usage: npdev ccp login <name> [options]

Arguments:
  <name>              Developer name (must be registered on VPS)

Options:
  --token <token>     Use a token directly instead of browser OAuth
  --email <email>     Hint email for the OAuth login page
  --help, -h          Show this help

OAuth flow (default):
  Runs 'claude setup-token' to create a long-lived OAuth token.
  Opens a browser for authentication, then sends the token to VPS.

Token flow (--token):
  Saves the provided token to the VPS profile directly.
  Useful when you already have a valid access token.

After login, run 'ccp use <name>' on the VPS to activate the profile.

Examples:
  npdev ccp login ced              Browser OAuth (recommended)
  npdev ccp login ced --token sk-… Save a token directly`);
      return;
    }

    const name = args[0];
    let token: string | undefined;
    let email: string | undefined;

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--token" && args[i + 1]) {
        token = args[++i];
      } else if (args[i] === "--email" && args[i + 1]) {
        email = args[++i];
      }
    }

    if (token) {
      await localTokenLogin(machine, name, token);
    } else {
      await localOAuthLogin(machine, name, email);
    }
    return;
  }

  // All other subcommands: forward to VPS
  await ensureScript(machine);
  const escaped = subArgs.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
  const cmd = `bash ${REMOTE_SCRIPT} ${escaped}`;

  if (opts.json) {
    const { stdout, exitCode } = await sshExec(machine, `${cmd} --json`);
    if (stdout) console.log(stdout.trim());
    if (exitCode !== 0) process.exit(exitCode);
  } else {
    await sshInteractive(machine, cmd);
  }
}
