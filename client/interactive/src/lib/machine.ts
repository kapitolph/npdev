import * as p from "@clack/prompts";
import type { Machine } from "../types";
import { loadMachines } from "./config";
import { configError, notFoundError, usageError } from "./errors";

export async function selectMachine(
  machineOverride?: string,
  opts: { interactive?: boolean } = {},
): Promise<Machine> {
  const machines = await loadMachines();

  if (machines.length === 0) {
    throw configError("No machines defined. Run: npdev update");
  }

  if (machineOverride) {
    const m = machines.find((m) => m.name === machineOverride);
    if (!m) {
      throw notFoundError(`Machine '${machineOverride}' not found`, { machine: machineOverride });
    }
    return m;
  }

  if (machines.length === 1) {
    return machines[0];
  }

  if (opts.interactive === false) {
    throw usageError(
      "Multiple machines configured. Pass --machine <name> for non-interactive use.",
      {
        machines: machines.map((machine) => machine.name),
      },
    );
  }

  const choice = await p.select({
    message: "Select machine",
    options: machines.map((m) => ({
      value: m.name,
      label: `${m.name} — ${m.description}`,
    })),
  });

  if (p.isCancel(choice)) {
    p.outro("Cancelled.");
    process.exit(0);
  }

  const found = machines.find((m) => m.name === choice);
  if (!found) throw new Error(`Machine '${choice}' not found`);
  return found;
}
