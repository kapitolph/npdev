import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import type { Config, Machine } from "../types";

const NPDEV_DIR = join(homedir(), ".npdev");
export const CONFIG_FILE = join(NPDEV_DIR, "config");
export const MACHINES_FILE = join(NPDEV_DIR, "machines.yaml");

export async function loadConfig(): Promise<Config> {
  let npdevUser = "";
  try {
    const content = await readFile(CONFIG_FILE, "utf-8");
    const match = content.match(/NPDEV_USER="([^"]*)"/);
    if (match) npdevUser = match[1];
  } catch {
    // No config file yet
  }
  return { npdevUser };
}

export async function loadMachines(): Promise<Machine[]> {
  let content: string;
  try {
    content = await readFile(MACHINES_FILE, "utf-8");
  } catch {
    return [];
  }

  const machines: Machine[] = [];
  let current: Partial<Machine> | null = null;

  for (const line of content.split("\n")) {
    const nameMatch = line.match(/^\s+-\s+name:\s+(.+)/);
    if (nameMatch) {
      if (current?.name) machines.push(current as Machine);
      current = { name: nameMatch[1].trim(), host: "", user: "", description: "" };
      continue;
    }
    if (!current) continue;

    const hostMatch = line.match(/^\s+host:\s+(.+)/);
    if (hostMatch) { current.host = hostMatch[1].trim(); continue; }

    const userMatch = line.match(/^\s+user:\s+(.+)/);
    if (userMatch) { current.user = userMatch[1].trim(); continue; }

    const descMatch = line.match(/^\s+description:\s+"?([^"]*)"?/);
    if (descMatch) { current.description = descMatch[1].trim(); continue; }
  }
  if (current?.name) machines.push(current as Machine);

  return machines;
}

export function npdevDir(): string {
  return NPDEV_DIR;
}

export function isOnVPS(): boolean {
  return existsSync(`${homedir()}/.vps`);
}
