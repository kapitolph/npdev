import chalk from "chalk";
import type { Machine } from "../types";
import { sshExec } from "../lib/ssh";

const GITHUB_REPO = "kapitolph/dev-vps";

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

  let added = 0;
  for (const file of pubFiles) {
    const name = file.name.replace(/\.pub$/, "");
    const keyResp = await fetch(
      `https://raw.githubusercontent.com/${GITHUB_REPO}/main/keys/${file.name}`
    );
    if (!keyResp.ok) continue;
    const key = (await keyResp.text()).trim();
    if (!key) continue;

    const { stdout } = await sshExec(
      machine,
      `grep -qF '${key}' ~/.ssh/authorized_keys 2>/dev/null && echo 'exists' || { echo '${key}' >> ~/.ssh/authorized_keys && echo 'added'; }`
    );

    if (stdout === "added") {
      console.log(chalk.green(`  ✓ Added key: ${name}`));
      added++;
    } else {
      console.log(chalk.dim(`  · Already present: ${name}`));
    }
  }

  if (added > 0) {
    console.log(chalk.green(`${added} new key(s) synced to ${machine.name}`));
  } else {
    console.log("All keys already synced.");
  }
}
