import * as p from "@clack/prompts";
import { writeFile, mkdir } from "fs/promises";
import { CONFIG_FILE, npdevDir } from "../lib/config";
import { selectMachine } from "../lib/machine";
import { sshExec } from "../lib/ssh";

export async function cmdSetup(machineOverride?: string): Promise<void> {
  p.intro("Developer identity setup");

  const devName = await p.text({
    message: "Your name (e.g. don)",
    validate: (v) => (!v ? "Name is required" : undefined),
  });
  if (p.isCancel(devName)) { p.outro("Cancelled."); process.exit(0); }

  const defaultEmail = `${devName}@nextfinancial.io`;
  const devEmail = await p.text({
    message: "Your email",
    initialValue: defaultEmail,
  });
  if (p.isCancel(devEmail)) { p.outro("Cancelled."); process.exit(0); }

  const ghToken = await p.password({
    message: "GitHub personal access token (repo, read:org scopes)",
  });
  if (p.isCancel(ghToken)) { p.outro("Cancelled."); process.exit(0); }

  // Save locally
  await mkdir(npdevDir(), { recursive: true });
  await writeFile(CONFIG_FILE, `# npdev config — managed by npdev setup\nNPDEV_USER="${devName}"\n`);
  p.log.success(`Local identity saved (NPDEV_USER=${devName})`);

  // Create env on VPS
  const machine = await selectMachine(machineOverride);
  const envContent = `# Developer identity for ${devName}
export GIT_AUTHOR_NAME="${devName}"
export GIT_AUTHOR_EMAIL="${devEmail}"
export GIT_COMMITTER_NAME="${devName}"
export GIT_COMMITTER_EMAIL="${devEmail}"
export GH_TOKEN="${ghToken}"`;

  const { exitCode } = await sshExec(
    machine,
    `mkdir -p ~/.vps/developers && cat > ~/.vps/developers/${devName}.env << 'DEVEOF'\n${envContent}\nDEVEOF\nchmod 600 ~/.vps/developers/${devName}.env`
  );

  if (exitCode !== 0) {
    p.log.error("Failed to create VPS identity file");
    process.exit(1);
  }
  p.log.success(`VPS identity created at ~/.vps/developers/${devName}.env`);

  // Ensure git credential helper
  await sshExec(
    machine,
    `if [[ ! -f ~/.vps/git-credential-token ]]; then
cat > ~/.vps/git-credential-token << 'CREDHELPER'
#!/bin/bash
if [[ -n "\${GH_TOKEN:-}" ]]; then
  echo "protocol=https"
  echo "host=github.com"
  echo "username=x-access-token"
  echo "password=\${GH_TOKEN}"
fi
CREDHELPER
chmod +x ~/.vps/git-credential-token
git config --global credential.helper "!bash ~/.vps/git-credential-token"
fi`
  );
  p.log.success("Git credential helper configured");

  // Verify
  const { stdout } = await sshExec(
    machine,
    `source ~/.vps/developers/${devName}.env && echo "Git: $GIT_AUTHOR_NAME <$GIT_AUTHOR_EMAIL>" && echo "GH: token set (\${#GH_TOKEN} chars)"`
  );
  if (stdout) console.log(`  ${stdout}`);

  p.outro("Done! Sessions will now use your identity. Test with: npdev my-session");
}
