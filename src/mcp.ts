import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  boardStats,
  createBug,
  createSheet,
  failBug,
  getBug,
  getDb,
  listBugsNested,
  listSheets,
  passBug,
  updateBug,
  updateSheet,
} from "./db.js";
import { DB_PATH, baseUrl, getPort } from "./paths.js";
import { ensureServerRunning, healthOk, openBoard } from "./open.js";
import type { BugStatus } from "./types.js";

function textContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function runMcpServer(): Promise<void> {
  getDb();

  const server = new Server(
    { name: "bugboard", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "board_status",
        description: "Health, DB path, port, and aggregate bug counts",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "board_open",
        description: "Start HTTP server if needed and open the board in the browser",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "sheet_list",
        description: "List sheets (default: non-archived)",
        inputSchema: {
          type: "object",
          properties: { include_archived: { type: "boolean" } },
          additionalProperties: false,
        },
      },
      {
        name: "sheet_create",
        description: "Create a new sheet tab",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        },
      },
      {
        name: "sheet_rename",
        description: "Rename a sheet",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, name: { type: "string" } },
          required: ["id", "name"],
          additionalProperties: false,
        },
      },
      {
        name: "sheet_archive",
        description: "Archive a sheet (hidden from default list)",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_list",
        description: "List bugs on a sheet (nested: journeys with children[])",
        inputSchema: {
          type: "object",
          properties: {
            sheet_id: { type: "string" },
            status: { type: "string", enum: ["fazendo", "testar", "ok", "falhou"] },
          },
          required: ["sheet_id"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_get",
        description: "Get one bug by id",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_create",
        description: "Create a bug card on a sheet",
        inputSchema: {
          type: "object",
          properties: {
            sheet_id: { type: "string" },
            title: { type: "string" },
            repos: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["fazendo", "testar", "ok", "falhou"] },
            where: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            fix: { type: "string" },
            round: { type: "number" },
            note: { type: "string" },
            parent_id: { type: "string" },
            kind: { type: "string", enum: ["journey", "usecase"] },
            platform: { type: "string", enum: ["ios", "android", "web", "ipad"] },
            prep: { type: "array", items: { type: "string" } },
          },
          required: ["sheet_id", "title"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_update",
        description:
          "Update bug fields. If status becomes testar from ok/falhou, round auto-increments unless round is set.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            repos: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["fazendo", "testar", "ok", "falhou"] },
            where: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            fix: { type: "string" },
            round: { type: "number" },
            note: { type: "string" },
            platform: { type: "string", enum: ["ios", "android", "web", "ipad"] },
            prep: { type: "array", items: { type: "string" } },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_pass",
        description: "Mark bug as ok (human validation)",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, note: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_fail",
        description: "Mark bug as falhou (human validation)",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, note: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    switch (name) {
      case "board_status": {
        const port = getPort();
        const httpOk = await healthOk(port);
        return textContent({
          ok: true,
          http: httpOk,
          url: baseUrl(port),
          dbPath: DB_PATH,
          port,
          stats: boardStats(),
        });
      }
      case "board_open": {
        const result = await openBoard();
        return textContent(result);
      }
      case "sheet_list": {
        const include = a.include_archived === true;
        return textContent({ sheets: listSheets(include) });
      }
      case "sheet_create": {
        const sheet = createSheet(String(a.name));
        return textContent({ sheet });
      }
      case "sheet_rename": {
        const sheet = updateSheet(String(a.id), { name: String(a.name) });
        if (!sheet) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ sheet });
      }
      case "sheet_archive": {
        const sheet = updateSheet(String(a.id), { archived: 1 });
        if (!sheet) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ sheet });
      }
      case "bug_list": {
        const status = a.status as BugStatus | undefined;
        return textContent({ bugs: listBugsNested(String(a.sheet_id), status) });
      }
      case "bug_get": {
        const bug = getBug(String(a.id));
        if (!bug) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ bug });
      }
      case "bug_create": {
        const bug = createBug(String(a.sheet_id), {
          title: String(a.title),
          repos: a.repos as string[] | undefined,
          status: a.status as BugStatus | undefined,
          where: a.where as string | undefined,
          steps: a.steps as string[] | undefined,
          fix: a.fix as string | undefined,
          round: a.round as number | undefined,
          note: a.note as string | undefined,
          parent_id: a.parent_id as string | undefined,
          kind: a.kind as "journey" | "usecase" | undefined,
          platform: a.platform as "ios" | "android" | "web" | "ipad" | undefined,
          prep: a.prep as string[] | undefined,
        });
        if (!bug) return { content: [{ type: "text", text: "sheet not found" }], isError: true };
        return textContent({ bug });
      }
      case "bug_update": {
        const bug = updateBug(String(a.id), {
          title: a.title as string | undefined,
          repos: a.repos as string[] | undefined,
          status: a.status as BugStatus | undefined,
          where: a.where as string | undefined,
          steps: a.steps as string[] | undefined,
          fix: a.fix as string | undefined,
          round: a.round as number | undefined,
          note: a.note as string | undefined,
          platform: a.platform as "ios" | "android" | "web" | "ipad" | undefined,
          prep: a.prep as string[] | undefined,
        });
        if (!bug) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ bug });
      }
      case "bug_pass": {
        const bug = passBug(String(a.id), a.note as string | undefined);
        if (!bug) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ bug });
      }
      case "bug_fail": {
        const bug = failBug(String(a.id), a.note as string | undefined);
        if (!bug) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ bug });
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  await ensureServerRunning().catch(() => {
    /* MCP works without HTTP; board_open handles server */
  });
}
