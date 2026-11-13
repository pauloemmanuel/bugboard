// Run after `npm run build`: node test/graph-smoke.mjs  (uses temp dirs, never ~/.bugboard)
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const data = mkdtempSync(join(tmpdir(), "bb-data-"));
const code = mkdtempSync(join(tmpdir(), "bb-code-"));
process.env.BUGBOARD_DATA_DIR = data;
process.env.BUGBOARD_CODE_ROOT = code;

mkdirSync(join(code, "app-repo", "graphify-out"), { recursive: true });
writeFileSync(
  join(code, "app-repo", "graphify-out", "graph.json"),
  JSON.stringify({
    nodes: [
      { id: "g_withdraw_file", label: "withdraw.ts", source_file: "app/withdraw.ts", community: 7, community_name: "withdraw" },
      { id: "g_withdraw_fn", label: "submitWithdraw()", source_file: "app/withdraw.ts", community: 7, community_name: "withdraw" },
    ],
    links: [],
  }),
);

const db = await import("../dist/db.js");
const g = await import("../dist/graph.js");
const sheet = db.createSheet("T");
const mk = (title, extra = {}) => db.createBug(sheet.id, { title, ...extra });
const j = mk("Saque Android", { kind: "journey" });
const a = mk("Saque falha ao enviar documento", { parent_id: j.id, files: ["app-repo/app/withdraw.ts"], symbols: ["submitWithdraw"], repos: ["app-repo"] });
const b = mk("Saque falha ao enviar documento selfie", { parent_id: j.id, files: ["app-repo/app/withdraw.ts"] });
const c = mk("Chat nao carrega mensagens", { kind: "journey", symbols: ["loadChat"] });
const d = mk("Perfil trava", { kind: "journey" });
db.linkBugs(c.id, d.id, "related");

const q = g.boardQuery({ sheet_id: sheet.id, question: "saque documento" });
console.log(q, "\n");
assert.match(q, /NODE #2 \[fazendo\] usecase Saque falha/);
assert.match(q, /shares_code/);
const e = g.boardExplain(`#${a.n}`);
console.log(e, "\n");
assert.match(e, /touches_file/);
assert.match(e, /similar_title/);
const ef = g.boardExplain("app-repo/app/withdraw.ts");
console.log(ef, "\n");
assert.match(ef, /graphify=g_withdraw_file/);
const p = g.boardPath(`#${j.n}`, `#${b.n}`);
console.log(p, "\n");
assert.match(p, /Shortest path/);
const p2 = g.boardPath(`#${a.n}`, "loadChat");
console.log(p2, "\n");
assert.match(p2, /No path/);
const p3 = g.boardPath(`#${d.n}`, "loadChat");
console.log(p3, "\n");
assert.match(p3, /Shortest path/);
const cl = g.boardClusters(sheet.id);
console.log(cl, "\n");
assert.match(cl, /CLUSTER 1/);
assert.match(cl, /UNGROUPED/);
const tiny = g.boardQuery({ question: "saque", budget: 40 });
assert.match(tiny, /TRUNCATED/);
assert.ok(existsSync(join(data, "graph.json")), "graph.json exported");
const exp = JSON.parse((await import("node:fs")).readFileSync(join(data, "graph.json"), "utf8"));
assert.ok(exp.nodes.length > 5 && exp.links.length > 5);
assert.equal(db.getBug(c.id).links.length, 1);

// migration on a copy of a legacy-shaped DB
const live = join(homedir(), ".bugboard", "data.sqlite");
if (process.env.BB_MIGRATE_COPY && existsSync(live)) {
  console.log("migration copy:", process.env.BB_MIGRATE_COPY);
}
console.log("OK");
