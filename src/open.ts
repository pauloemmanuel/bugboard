import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { baseUrl, getPort, LOG_PATH, PID_PATH } from "./paths.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const entryScript = join(here, "index.js");

export async function healthOk(port = getPort()): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl(port)}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readStoredPid(): number | null {
  if (!existsSync(PID_PATH)) return null;
  const raw = readFileSync(PID_PATH, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  if (Number.isNaN(pid)) return null;
  if (!isProcessRunning(pid)) {
    try {
      unlinkSync(PID_PATH);
    } catch {
      /* ignore */
    }
    return null;
  }
  return pid;
}

export async function ensureServerRunning(): Promise<{ port: number; started: boolean }> {
  const port = getPort();
  if (await healthOk(port)) {
    return { port, started: false };
  }
  const existingPid = readStoredPid();
  if (existingPid && (await healthOk(port))) {
    return { port, started: false };
  }

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  const logFd = openSync(LOG_PATH, "a");
  const child = spawn(process.execPath, [entryScript, "serve"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: { ...process.env },
  });
  child.unref();
  writeFileSync(PID_PATH, String(child.pid));

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 125));
    if (await healthOk(port)) {
      return { port, started: true };
    }
  }
  throw new Error(`Server did not respond on ${baseUrl(port)}. See ${LOG_PATH}`);
}

export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

export async function openBoard(): Promise<{ url: string; started: boolean }> {
  const { port, started } = await ensureServerRunning();
  const url = baseUrl(port);
  await openBrowser(url);
  return { url, started };
}
