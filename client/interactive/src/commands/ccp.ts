import { existsSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { scpUpload, sshExec, sshExecWithInput, sshInteractive } from "../lib/ssh";
import { isOnVPS } from "../lib/config";
import type { Machine } from "../types";

const REMOTE_SCRIPT = "~/.vps/claude-profile.sh";

async function ensureScript(machine: Machine): Promise<void> {
  const localPath = join(import.meta.dir, "../../../../server/claude-profile.sh");
  const result = await scpUpload(machine, localPath, "/home/dev/.vps/claude-profile.sh");
  if (result.exitCode !== 0) throw new Error(`Failed to sync ccp: ${result.error}`);
  await sshExec(machine, `chmod +x ${REMOTE_SCRIPT}`);
}

// ─── Local credential helpers ─────────────────────────────────────────────────

const CLAUDE_DIR = join(homedir(), ".claude");
const CREDS_FILE = join(CLAUDE_DIR, ".credentials.json");
const ACCOUNT_FILE = join(homedir(), ".claude.json");
const BACKUP_CREDS = join(CLAUDE_DIR, ".credentials.json.npdev-backup");
const BACKUP_ACCOUNT = join(homedir(), ".claude.json.npdev-backup");

function backupLocalCreds(): void {
  if (existsSync(CREDS_FILE)) copyFileSync(CREDS_FILE, BACKUP_CREDS);
  if (existsSync(ACCOUNT_FILE)) copyFileSync(ACCOUNT_FILE, BACKUP_ACCOUNT);
}

function restoreLocalCreds(): void {
  try {
    if (existsSync(BACKUP_CREDS)) {
      copyFileSync(BACKUP_CREDS, CREDS_FILE);
      unlinkSync(BACKUP_CREDS);
    }
    if (existsSync(BACKUP_ACCOUNT)) {
      copyFileSync(BACKUP_ACCOUNT, ACCOUNT_FILE);
      unlinkSync(BACKUP_ACCOUNT);
    }
  } catch (err) {
    console.error(`WARNING: Failed to restore local credentials backup: ${err}`);
    console.error("Your local Claude session may need re-authentication.");
  }
}

function readLocalCredentials(): { credentials: object; account: object } | null {
  try {
    let creds: object;

    if (platform() === "darwin") {
      // macOS: try keychain first
      const result = Bun.spawnSync([
        "security", "find-generic-password",
        "-a", process.env.USER || "",
        "-s", "Claude Code-credentials",
        "-w",
      ], { stdout: "pipe", stderr: "pipe" });

      if (result.exitCode === 0) {
        const keychainData = new TextDecoder().decode(result.stdout).trim();
        creds = JSON.parse(keychainData);
      } else if (existsSync(CREDS_FILE)) {
        creds = JSON.parse(readFileSync(CREDS_FILE, "utf-8"));
      } else {
        return null;
      }
    } else {
      // Linux / other: read from file
      if (!existsSync(CREDS_FILE)) return null;
      creds = JSON.parse(readFileSync(CREDS_FILE, "utf-8"));
    }

    // Read account info
    if (!existsSync(ACCOUNT_FILE)) return null;
    const accountFull = JSON.parse(readFileSync(ACCOUNT_FILE, "utf-8"));
    const account: Record<string, unknown> = {};
    if (accountFull.oauthAccount) account.oauthAccount = accountFull.oauthAccount;
    if (accountFull.userID) account.userID = accountFull.userID;

    return { credentials: creds, account };
  } catch {
    return null;
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

  // 2. Backup local credentials
  console.log("Backing up local Claude credentials...");
  backupLocalCreds();

  // 3. Run `claude login` locally
  console.log("Starting Claude login (browser will open)...");
  const loginProc = Bun.spawn(["claude", "login"], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const loginExit = await loginProc.exited;

  if (loginExit !== 0) {
    console.error("Claude login failed. Restoring local credentials...");
    restoreLocalCreds();
    process.exit(1);
  }

  // 4. Read newly created credentials
  console.log("Reading new credentials...");
  const localCreds = readLocalCredentials();
  if (!localCreds) {
    console.error("ERROR: Could not read credentials after login. Restoring backup...");
    restoreLocalCreds();
    process.exit(1);
  }

  // 5. Restore original local credentials
  console.log("Restoring local Claude credentials...");
  restoreLocalCreds();

  // 6. Pipe credentials to VPS via ccp import
  const payload = JSON.stringify(localCreds);
  console.log("Sending credentials to VPS...");

  const escaped = `'${name.replace(/'/g, "'\\''")}'`;
  const importCmd = `bash ${REMOTE_SCRIPT} import ${escaped}`;
  const { stdout, exitCode } = await sshExecWithInput(machine, importCmd, payload);

  if (exitCode !== 0) {
    console.error("ERROR: Failed to import credentials to VPS.");
    // Fallback: print base64 for manual import
    const b64 = Buffer.from(payload).toString("base64");
    console.error("\nFallback: run this on the VPS manually:");
    console.error(`  echo '${b64}' | base64 -d | bash ${REMOTE_SCRIPT} import ${escaped}`);
    process.exit(1);
  }

  if (stdout) console.log(stdout);
  console.log(`\nRun 'ccp use ${name}' on VPS to activate.`);
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
  const expiresAt = nowMs + 864000 * 1000; // 10 days
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
  Opens a browser on your local machine for Claude OAuth login.
  After authentication, credentials are automatically transferred
  to the VPS. Your local Claude setup is backed up and restored.

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
