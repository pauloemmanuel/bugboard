#!/usr/bin/env node
import { DB_PATH, LOG_PATH, PID_PATH, baseUrl, getPort } from "./paths.js";
import { boardStats, getDb } from "./db.js";
import { healthOk, openBoard, readStoredPid } from "./open.js";
import { runMcpServer } from "./mcp.js";
import { startHttpServer } from "./server.js";

const cmd = process.argv[2] ?? "serve";

async function main(): Promise<void> {
  switch (cmd) {
    case "serve":
      getDb();
      startHttpServer();
      break;
    case "open":
      await openBoard();
      break;
    case "status": {
      getDb();
      const port = getPort();
      const http = await healthOk(port);
      const pid = readStoredPid();
      console.log(
        JSON.stringify(
          {
            http,
            url: baseUrl(port),
            port,
            pid,
            pidFile: PID_PATH,
            logFile: LOG_PATH,
            dbPath: DB_PATH,
            stats: boardStats(),
          },
          null,
          2,
        ),
      );
      if (!http) process.exitCode = 1;
      break;
    }
    case "mcp":
      await runMcpServer();
      break;
    default:
      console.error(`Unknown command: ${cmd}. Use: serve | open | status | mcp`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
