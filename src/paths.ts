import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = join(homedir(), ".bugboard");
export const DB_PATH = join(DATA_DIR, "data.sqlite");
export const PID_PATH = join(DATA_DIR, "server.pid");
export const LOG_PATH = join(DATA_DIR, "server.log");

export const DEFAULT_PORT = 3847;

export function getPort(): number {
  const raw = process.env.BUGBOARD_PORT;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return DEFAULT_PORT;
}

export function baseUrl(port = getPort()): string {
  return `http://127.0.0.1:${port}`;
}

const here = fileURLToPath(new URL(".", import.meta.url));

export function webDistDir(): string {
  return join(here, "..", "web", "dist");
}
