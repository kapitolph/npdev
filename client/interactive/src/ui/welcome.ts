import chalk from "chalk";
import type { VersionInfo } from "../types";

export function showWelcome(version: VersionInfo): void {
  console.log();
  console.log(chalk.bold.cyan("  npdev") + chalk.dim(` v${version.current}`));

  if (version.latest && version.latest !== version.current) {
    console.log(chalk.yellow(`  ⚠ v${version.latest} available — run: npdev update`));
  } else if (version.latest) {
    console.log(chalk.green("  ✓ up to date"));
  }

  console.log();
}
