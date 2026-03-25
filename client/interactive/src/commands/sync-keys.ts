import chalk from "chalk";
import { sshExec } from "../lib/ssh";
import type { Machine } from "../types";

const GITHUB_REPO = "kapitolph/npdev";

export async function cmdSyncKeys(machine: Machine): Promise<void> {
  console.log(`Fetching keys from GitHub (${GITHUB_REPO})...`);

  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/keys`);
  if (!resp.ok) {
    console.error("Failed to list keys from GitHub API.");
    process.exit(1);
  }

  const files: { name: string }[] = await resp.json();
  const pubFiles = files.filter((f) => f.name.endsWith(".pub") && f.name !== ".gitkeep");

  if (pubFiles.length === 0) {
    console.log("No .pub files found in keys/.");
    return;
  }

  // Fetch the key-to-developer mapping from the VPS
  const { stdout: mapJson } = await sshExec(machine, "cat ~/.vps/ssh-key-map.json 2>/dev/null");
  let keyMap: Record<string, string> = {};
  try {
    keyMap = JSON.parse(mapJson);
  } catch {
    console.log(chalk.yellow("Warning: Could not parse ssh-key-map.json, adding keys without environment prefix"));
  }

  let added = 0;
  let updated = 0;
  for (const file of pubFiles) {
    const name = file.name.replace(/\.pub$/, "");
    const keyResp = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/main/keys/${file.name}`,
    );
    if (!keyResp.ok) continue;
    const key = (await keyResp.text()).trim();
    if (!key) continue;

    // Build environment prefix from key map
    const devId = keyMap[name] ?? "";
    const envPrefix = devId ? `environment="NPDEV_SSH_USER=${devId}" ` : "";
    const fullLine = `${envPrefix}${key}`;

    // Extract key body (type + base64) for matching
    const keyParts = key.split(" ");
    const keyBody = `${keyParts[0]} ${keyParts[1]}`;

    const { stdout } = await sshExec(
      machine,
      `existing=$(grep -F '${keyBody}' ~/.ssh/authorized_keys 2>/dev/null || true); ` +
      `if [ -n "$existing" ]; then ` +
        `if [ "$existing" = '${fullLine}' ]; then echo 'exists'; ` +
        `else sed -i "\\|${keyBody}|c\\\\${fullLine}" ~/.ssh/authorized_keys && echo 'updated'; fi; ` +
      `else echo '${fullLine}' >> ~/.ssh/authorized_keys && echo 'added'; fi`,
    );

    if (stdout === "added") {
      console.log(chalk.green(`  ✓ Added key: ${name}`));
      added++;
    } else if (stdout === "updated") {
      console.log(chalk.yellow(`  ✓ Updated key: ${name}`));
      updated++;
    } else {
      console.log(chalk.dim(`  · Already present: ${name}`));
    }
  }

  if (added + updated > 0) {
    console.log(chalk.green(`${added} added, ${updated} updated on ${machine.name}`));
  } else {
    console.log("All keys already synced.");
  }
}
