import * as p from "@clack/prompts";
import type { Machine } from "../types";
import { loadMachines } from "./config";

export async function selectMachine(machineOverride?: string): Promise<Machine> {
  const machines = await loadMachines();

  if (machines.length === 0) {
    console.error("Error: No machines defined. Run: npdev update");
    process.exit(1);
  }

  if (machineOverride) {
    const m = machines.find((m) => m.name === machineOverride);
    if (!m) {
      console.error(`Error: Machine '${machineOverride}' not found`);
      process.exit(1);
    }
    return m;
  }

  if (machines.length === 1) {
    return machines[0];
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

  return machines.find((m) => m.name === choice)!;
}
