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
  cancelBug,
  getBug,
  getDb,
  linkBugs,
  listBugsFlat,
  listBugsNested,
  resolveBug,
  unlinkBugs,
  listSheets,
  passBug,
  updateBug,
  updateSheet,
} from "./db.js";
import { DB_PATH, baseUrl, getPort } from "./paths.js";
import { ensureServerRunning, healthOk, openBoard } from "./open.js";
import { boardClusters, boardExplain, boardPath, boardQuery } from "./graph.js";
import { LINK_TYPES } from "./types.js";
import type { Bug, BugStatus, LinkType } from "./types.js";

function plain(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}

function compactLine(b: Bug): string {
  const code = b.files.length || b.symbols.length ? ` files=${b.files.length} sym=${b.symbols.length}` : "";
  const parent = b.parent_id ? ` parent=${b.parent_id.slice(0, 8)}` : "";
  const att = (b.attachments ?? []).map((a) => `\n    [Imagem #${a.n}]: ${a.path}`).join("");
  return `#${b.n} [${b.status}] ${b.kind} ${b.title} (id=${b.id.slice(0, 8)}${parent}${code})${att}`;
}

function textContent(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export async function runMcpServer(): Promise<void> {
  getDb();

  const server = new Server(
    { name: "bugboard", version: "0.4.0" },
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
            status: { type: "string", enum: ["fazendo", "testar", "ok", "falhou", "cancelado"] },
            compact: { type: "boolean", description: "One line per card, no prep/steps" },
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
            status: { type: "string", enum: ["fazendo", "testar", "ok", "falhou", "cancelado"] },
            where: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            fix: { type: "string" },
            round: { type: "number" },
            note: { type: "string" },
            parent_id: { type: "string" },
            kind: { type: "string", enum: ["journey", "usecase"] },
            platform: { type: "string", enum: ["ios", "android", "web", "ipad"] },
            prep: { type: "array", items: { type: "string" } },
            files: { type: "array", items: { type: "string" }, description: "Repo-relative paths prefixed with the repo folder" },
            symbols: { type: "array", items: { type: "string" }, description: "Function or component names" },
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
            status: { type: "string", enum: ["fazendo", "testar", "ok", "falhou", "cancelado"] },
            where: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
            fix: { type: "string" },
            round: { type: "number" },
            note: { type: "string" },
            platform: { type: "string", enum: ["ios", "android", "web", "ipad"] },
            prep: { type: "array", items: { type: "string" } },
            files: { type: "array", items: { type: "string" }, description: "Repo-relative paths prefixed with the repo folder" },
            symbols: { type: "array", items: { type: "string" }, description: "Function or component names" },
          },
          required: ["id"],
          additionalProperties: false,
        },
      },
      {
        name: "board_query",
        description:
          'Graphify-style query over the board graph: keyword-match start nodes, BFS, NODE/EDGE lines. Like `graphify query "<q>"`.',
        inputSchema: {
          type: "object",
          properties: {
            sheet_id: { type: "string" },
            question: { type: "string" },
            depth: { type: "number", description: "default 2" },
            budget: { type: "number", description: "token budget, default 2000" },
          },
          required: ["question"],
          additionalProperties: false,
        },
      },
      {
        name: "board_explain",
        description: "Neighbors of a card (#n or id), file path or symbol, grouped by edge type",
        inputSchema: {
          type: "object",
          properties: { ref: { type: "string" }, budget: { type: "number" } },
          required: ["ref"],
          additionalProperties: false,
        },
      },
      {
        name: "board_path",
        description: "Shortest path between two cards, files or symbols",
        inputSchema: {
          type: "object",
          properties: { a: { type: "string" }, b: { type: "string" }, budget: { type: "number" } },
          required: ["a", "b"],
          additionalProperties: false,
        },
      },
      {
        name: "board_clusters",
        description:
          "Groups of cards connected by shared code, links or similar titles, with a suggested journey per group (for building flows and merging duplicates)",
        inputSchema: {
          type: "object",
          properties: { sheet_id: { type: "string" }, budget: { type: "number" } },
          required: ["sheet_id"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_link",
        description: "Link two cards. from/to: card id, id prefix (8+) or #n (add sheet_id if n is ambiguous)",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            type: { type: "string", enum: LINK_TYPES },
            sheet_id: { type: "string" },
          },
          required: ["from", "to", "type"],
          additionalProperties: false,
        },
      },
      {
        name: "bug_unlink",
        description: "Remove links between two cards (all types unless type is set)",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            type: { type: "string", enum: LINK_TYPES },
            sheet_id: { type: "string" },
          },
          required: ["from", "to"],
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
      {
        name: "bug_cancel",
        description:
          "Mark bug as cancelado: the card no longer makes sense (the screen changed, the button is gone, or the scenario was wrong). Put the reason in note. Reopen with bug_update status fazendo.",
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
        if (a.compact === true) {
          const flat = listBugsFlat(String(a.sheet_id), status);
          return plain(flat.map(compactLine).join("\n") || "(empty)");
        }
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
          files: a.files as string[] | undefined,
          symbols: a.symbols as string[] | undefined,
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
          files: a.files as string[] | undefined,
          symbols: a.symbols as string[] | undefined,
        });
        if (!bug) return { content: [{ type: "text", text: "not found" }], isError: true };
        return textContent({ bug });
      }
      case "board_query":
        return plain(
          boardQuery({
            sheet_id: a.sheet_id as string | undefined,
            question: String(a.question),
            depth: a.depth as number | undefined,
            budget: a.budget as number | undefined,
          }),
        );
      case "board_explain":
        return plain(boardExplain(String(a.ref), a.budget as number | undefined));
      case "board_path":
        return plain(boardPath(String(a.a), String(a.b), a.budget as number | undefined));
      case "board_clusters":
        return plain(boardClusters(String(a.sheet_id), a.budget as number | undefined));
      case "bug_link":
      case "bug_unlink": {
        const sid = a.sheet_id as string | undefined;
        const from = resolveBug(String(a.from), sid);
        const to = resolveBug(String(a.to), sid);
        if (!from || !to) return plain("card not found or ambiguous (pass sheet_id for #n)", true);
        if (name === "bug_link") {
          const r = linkBugs(from.id, to.id, a.type as LinkType);
          if (typeof r === "string") return plain(r, true);
          return plain(`linked #${from.n} --${r.type}--> #${to.n}`);
        }
        const n = unlinkBugs(from.id, to.id, a.type as LinkType | undefined);
        return plain(`removed ${n} link(s) between #${from.n} and #${to.n}`);
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
      case "bug_cancel": {
        const bug = cancelBug(String(a.id), a.note as string | undefined);
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
