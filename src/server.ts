import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  boardStats,
  createBug,
  createSheet,
  failBug,
  getBug,
  getDb,
  listBugs,
  listSheets,
  passBug,
  updateBug,
  updateSheet,
} from "./db.js";
import { DB_PATH, getPort, webDistDir } from "./paths.js";
import type { BugStatus } from "./types.js";

export function createApp(): Hono {
  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) => {
    getDb();
    return c.json({ ok: true, port: getPort(), dbPath: DB_PATH });
  });

  app.get("/api/sheets", (c) => {
    const archived = c.req.query("archived") === "1";
    return c.json({ sheets: listSheets(archived) });
  });

  app.post("/api/sheets", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    if (!body.name?.trim()) {
      return c.json({ error: "name required" }, 400);
    }
    const sheet = createSheet(body.name);
    return c.json({ sheet }, 201);
  });

  app.patch("/api/sheets/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json()) as { name?: string; archived?: number };
    const sheet = updateSheet(id, body);
    if (!sheet) return c.json({ error: "not found" }, 404);
    return c.json({ sheet });
  });

  app.get("/api/sheets/:id/bugs", (c) => {
    const id = c.req.param("id");
    const status = c.req.query("status") as BugStatus | undefined;
    return c.json({ bugs: listBugs(id, status) });
  });

  app.post("/api/sheets/:id/bugs", async (c) => {
    const sheetId = c.req.param("id");
    const body = (await c.req.json()) as {
      title?: string;
      repos?: string[];
      status?: BugStatus;
      where?: string;
      steps?: string[];
      fix?: string;
      round?: number;
      note?: string;
    };
    if (!body.title?.trim()) {
      return c.json({ error: "title required" }, 400);
    }
    const bug = createBug(sheetId, body as { title: string });
    if (!bug) return c.json({ error: "sheet not found" }, 404);
    return c.json({ bug }, 201);
  });

  app.patch("/api/bugs/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const bug = updateBug(id, body);
    if (!bug) return c.json({ error: "not found" }, 404);
    return c.json({ bug });
  });

  app.post("/api/bugs/:id/pass", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { note?: string };
    const bug = passBug(id, body.note);
    if (!bug) return c.json({ error: "not found" }, 404);
    return c.json({ bug });
  });

  app.post("/api/bugs/:id/fail", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as { note?: string };
    const bug = failBug(id, body.note);
    if (!bug) return c.json({ error: "not found" }, 404);
    return c.json({ bug });
  });

  app.get("/api/stats", (c) => {
    const sheetId = c.req.query("sheet_id");
    return c.json({ stats: boardStats(sheetId ?? undefined) });
  });

  const webRoot = webDistDir();
  app.get("/", serveStatic({ path: `${webRoot}/index.html` }));
  app.get("/assets/*", serveStatic({ root: webRoot }));
  app.get("/index.html", serveStatic({ path: `${webRoot}/index.html` }));

  return app;
}

export function startHttpServer(): void {
  const port = getPort();
  const app = createApp();
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`bugboard listening on http://127.0.0.1:${info.port}`);
  });
}
