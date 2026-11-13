import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dbVersion, listAllBugs, listAllLinks, listSheets, resolveBug } from "./db.js";
import { GRAPH_PATH, codeRoot } from "./paths.js";
import type { Bug } from "./types.js";

export type NodeKind = "sheet" | "journey" | "usecase" | "repo" | "file" | "symbol";

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  sheet_id?: string;
  bug?: Bug;
  /** graphify linkage (file and symbol nodes) */
  graphify_id?: string;
  community?: string;
  source?: string;
}

export interface GEdge {
  a: string;
  b: string;
  rel: string;
  inferred?: boolean;
  detail?: string;
}

export interface BoardGraph {
  nodes: Map<string, GNode>;
  edges: GEdge[];
  adj: Map<string, GEdge[]>;
}

const STOP = new Set(
  "a o e de da do das dos em no na nos nas um uma para por com sem ao aos que se ou the an of to in on for and or is are with from at by as it be this that not fix bug erro ao app tela".split(
    " ",
  ),
);

function tokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOP.has(raw)) out.add(raw);
  }
  return out;
}

export function cardId(b: Bug): string {
  return `card:${b.id}`;
}

// ---- graphify attach -------------------------------------------------------

interface GfNode {
  id: string;
  label?: string;
  source_file?: string;
  community?: number;
  community_name?: string;
}
interface GfIndex {
  mtime: number;
  byFile: Map<string, GfNode[]>;
}
const gfCache = new Map<string, GfIndex | null>();

function loadGraphify(repo: string): GfIndex | null {
  const p = join(codeRoot(), repo, "graphify-out", "graph.json");
  let mtime: number;
  try {
    mtime = statSync(p).mtimeMs;
  } catch {
    gfCache.set(repo, null);
    return null;
  }
  const hit = gfCache.get(repo);
  if (hit && hit.mtime === mtime) return hit;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as { nodes?: GfNode[] };
    const byFile = new Map<string, GfNode[]>();
    for (const n of raw.nodes ?? []) {
      if (!n.source_file) continue;
      const list = byFile.get(n.source_file) ?? [];
      list.push(n);
      byFile.set(n.source_file, list);
    }
    const idx = { mtime, byFile };
    gfCache.set(repo, idx);
    return idx;
  } catch {
    gfCache.set(repo, null);
    return null;
  }
}

function repoOfPath(p: string): { repo: string; rest: string } | null {
  const i = p.indexOf("/");
  if (i <= 0) return null;
  return { repo: p.slice(0, i), rest: p.slice(i + 1) };
}

function attachGraphify(file: GNode, symbolsOfCards: Set<string>, symNodes: Map<string, GNode>) {
  const parts = repoOfPath(file.label);
  if (!parts) return;
  const idx = loadGraphify(parts.repo);
  if (!idx) return;
  const nodes = idx.byFile.get(parts.rest);
  if (!nodes || nodes.length === 0) return;
  // file-level node: label equals the basename, else the first node
  const base = parts.rest.split("/").pop();
  const fnode = nodes.find((n) => n.label === base) ?? nodes[0];
  file.graphify_id = fnode.id;
  file.community = fnode.community_name ?? (fnode.community !== undefined ? String(fnode.community) : undefined);
  for (const n of nodes) {
    const label = (n.label ?? "").replace(/\(\)$/, "");
    if (!symbolsOfCards.has(label)) continue;
    const sn = symNodes.get(`sym:${label}`);
    if (sn && !sn.graphify_id) {
      sn.graphify_id = n.id;
      sn.community = n.community_name ?? (n.community !== undefined ? String(n.community) : undefined);
      sn.source = `${parts.repo}/${n.source_file}`;
    }
  }
}

// ---- build -----------------------------------------------------------------

function build(): BoardGraph {
  const sheets = listSheets(true);
  const bugs = listAllBugs();
  const links = listAllLinks();
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const add = (n: GNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return nodes.get(n.id)!;
  };
  const edge = (a: string, b: string, rel: string, extra: Partial<GEdge> = {}) =>
    edges.push({ a, b, rel, ...extra });

  const sheetName = new Map(sheets.map((s) => [s.id, s.name]));
  for (const s of sheets) add({ id: `sheet:${s.id}`, kind: "sheet", label: s.name, sheet_id: s.id });

  const byId = new Map(bugs.map((b) => [b.id, b]));
  const filesOf = new Map<string, Set<string>>();
  const symsOf = new Map<string, Set<string>>();
  const allSymbols = new Set<string>();

  for (const b of bugs) {
    add({
      id: cardId(b),
      kind: b.kind,
      label: `#${b.n} ${b.title}`,
      sheet_id: b.sheet_id,
      bug: b,
    });
    if (b.parent_id && byId.has(b.parent_id)) edge(cardId(b), `card:${b.parent_id}`, "parent");
    else edge(cardId(b), `sheet:${b.sheet_id}`, "in_sheet");

    for (const r of b.repos) {
      const name = r.trim();
      if (!name) continue;
      add({ id: `repo:${name}`, kind: "repo", label: name });
      edge(cardId(b), `repo:${name}`, "in_repo");
    }
    for (const f of b.files) {
      const fid = `file:${f}`;
      const fn = add({ id: fid, kind: "file", label: f });
      edge(cardId(b), fid, "touches_file");
      const set = filesOf.get(fid) ?? new Set();
      set.add(b.id);
      filesOf.set(fid, set);
      const parts = repoOfPath(f);
      if (parts) {
        add({ id: `repo:${parts.repo}`, kind: "repo", label: parts.repo });
        if (!edges.some((e) => e.a === fn.id && e.rel === "in_repo")) {
          edge(fn.id, `repo:${parts.repo}`, "in_repo");
        }
      }
    }
    for (const s of b.symbols) {
      const sid = `sym:${s}`;
      add({ id: sid, kind: "symbol", label: s });
      edge(cardId(b), sid, "touches_symbol");
      allSymbols.add(s);
      const set = symsOf.get(sid) ?? new Set();
      set.add(b.id);
      symsOf.set(sid, set);
    }
  }

  const symNodes = new Map<string, GNode>();
  for (const [id, n] of nodes) if (n.kind === "symbol") symNodes.set(id, n);
  for (const n of nodes.values()) if (n.kind === "file") attachGraphify(n, allSymbols, symNodes);

  for (const l of links) {
    if (byId.has(l.from_id) && byId.has(l.to_id)) {
      edge(`card:${l.from_id}`, `card:${l.to_id}`, l.type);
    }
  }

  // inferred: shares_code (same file or symbol)
  const shared = new Map<string, string[]>();
  for (const [map, prefix] of [
    [filesOf, "file"],
    [symsOf, "symbol"],
  ] as const) {
    for (const [nid, set] of map) {
      const ids = [...set];
      const label = nodes.get(nid)!.label;
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const key = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`;
          const arr = shared.get(key) ?? [];
          arr.push(`${prefix}:${label}`);
          shared.set(key, arr);
        }
    }
  }
  for (const [key, what] of shared) {
    const [x, y] = key.split("|");
    edge(`card:${x}`, `card:${y}`, "shares_code", { inferred: true, detail: what.slice(0, 3).join(", ") });
  }

  // inferred: similar_title (token overlap), skipping structural journey/usecase pairs
  const tok = new Map(bugs.map((b) => [b.id, tokens(b.title)]));
  for (let i = 0; i < bugs.length; i++) {
    const ta = tok.get(bugs[i].id)!;
    if (ta.size < 2) continue;
    for (let j = i + 1; j < bugs.length; j++) {
      const tb = tok.get(bugs[j].id)!;
      if (tb.size < 2) continue;
      let inter = 0;
      for (const t of ta) if (tb.has(t)) inter++;
      if (inter < 2) continue;
      const score = inter / (ta.size + tb.size - inter);
      if (score >= 0.5) {
        edge(cardId(bugs[i]), cardId(bugs[j]), "similar_title", {
          inferred: true,
          detail: score.toFixed(2),
        });
      }
    }
  }

  const adj = new Map<string, GEdge[]>();
  for (const e of edges) {
    for (const k of [e.a, e.b]) {
      const l = adj.get(k) ?? [];
      l.push(e);
      adj.set(k, l);
    }
  }
  void sheetName;
  return { nodes, edges, adj };
}

// ---- cache + export --------------------------------------------------------

let cache: { version: string; graph: BoardGraph } | null = null;

export function getGraph(): BoardGraph {
  const v = dbVersion();
  if (cache && cache.version === v) return cache.graph;
  const graph = build();
  cache = { version: v, graph };
  try {
    exportGraphJson(graph);
  } catch {
    /* export is best effort */
  }
  return graph;
}

export function exportGraphJson(g: BoardGraph, path = GRAPH_PATH): void {
  const nodes = [...g.nodes.values()].map((n) => ({
    id: n.id,
    label: n.label,
    file_type: n.kind === "file" || n.kind === "symbol" ? "code" : "document",
    norm_label: n.label.toLowerCase(),
    source_file: n.kind === "file" ? n.label : n.source ?? "",
    source_location: "",
    kind: n.kind,
    community: n.sheet_id ?? n.community ?? "board",
    community_name: n.community ?? (n.sheet_id ? `sheet:${n.sheet_id}` : "board"),
    status: n.bug?.status,
    graphify_id: n.graphify_id,
  }));
  const links = g.edges.map((e) => ({
    source: e.a,
    target: e.b,
    relation: e.rel,
    confidence: e.inferred ? "INFERRED" : "EXTRACTED",
    confidence_score: e.inferred ? 0.7 : 1.0,
    source_file: "",
    source_location: "",
    weight: 1.0,
  }));
  writeFileSync(
    path,
    JSON.stringify({ directed: false, multigraph: false, graph: { schema_version: 1, generator: "bugboard" }, nodes, links, hyperedges: [] }),
  );
}

// ---- text helpers ----------------------------------------------------------

export function nodeLine(n: GNode): string {
  if (n.bug) return `#${n.bug.n} [${n.bug.status}] ${n.bug.kind} ${n.bug.title}`;
  const extra: string[] = [];
  if (n.graphify_id) extra.push(`graphify=${n.graphify_id}`);
  if (n.community) extra.push(`community=${n.community}`);
  return `${n.kind} ${n.label}${extra.length ? ` [${extra.join(" ")}]` : ""}`;
}

function nodeRef(n: GNode): string {
  return n.bug ? `#${n.bug.n}` : n.label;
}

function edgeLine(g: BoardGraph, e: GEdge): string {
  const a = g.nodes.get(e.a)!;
  const b = g.nodes.get(e.b)!;
  return `EDGE ${nodeRef(a)} --${e.rel}${e.inferred ? " [INFERRED" + (e.detail ? " " + e.detail : "") + "]" : ""}--> ${nodeRef(b)}`;
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export function emit(header: string, lines: string[], budget = 2000): string {
  const out = [header, ""];
  let used = estimateTokens(header);
  let shown = 0;
  for (const l of lines) {
    const t = estimateTokens(l) + 1;
    if (used + t > budget) break;
    out.push(l);
    used += t;
    shown++;
  }
  if (shown < lines.length) {
    out.push(
      `... TRUNCATED: showing ${shown} of ${lines.length} lines (~${budget}-token budget). Raise budget or narrow the question.`,
    );
  }
  return out.join("\n");
}

function inSheet(n: GNode, sheetId?: string): boolean {
  if (!sheetId) return true;
  return n.sheet_id === sheetId || n.kind === "file" || n.kind === "symbol" || n.kind === "repo";
}

// ---- tools -----------------------------------------------------------------

export function boardQuery(opts: {
  sheet_id?: string;
  question: string;
  depth?: number;
  budget?: number;
}): string {
  const g = getGraph();
  const depth = opts.depth ?? 2;
  const qtok = [...tokens(opts.question)];
  const scored: [number, GNode][] = [];
  for (const n of g.nodes.values()) {
    if (n.kind === "sheet" || !inSheet(n, opts.sheet_id)) continue;
    const hay = `${n.label} ${n.bug?.where ?? ""} ${n.bug?.fix ?? ""}`.toLowerCase();
    let s = 0;
    for (const t of qtok) if (hay.includes(t)) s += n.label.toLowerCase().includes(t) ? 2 : 1;
    if (s > 0) scored.push([s, n]);
  }
  scored.sort((x, y) => y[0] - x[0]);
  const starts = scored.slice(0, 5).map(([, n]) => n);
  if (starts.length === 0) return `No node matches "${opts.question}".`;

  const dist = new Map<string, number>(starts.map((n) => [n.id, 0]));
  const order = starts.map((n) => n.id);
  const seenEdges = new Set<GEdge>();
  let frontier = starts.map((n) => n.id);
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of g.adj.get(id) ?? []) {
        const other = e.a === id ? e.b : e.a;
        const on = g.nodes.get(other)!;
        if (on.kind === "sheet" && !opts.sheet_id) continue;
        if (!inSheet(on, opts.sheet_id)) continue;
        seenEdges.add(e);
        if (!dist.has(other)) {
          dist.set(other, d + 1);
          order.push(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  const lines: string[] = [];
  for (const id of order) lines.push(`NODE ${nodeLine(g.nodes.get(id)!)}`);
  for (const e of seenEdges) if (dist.has(e.a) && dist.has(e.b)) lines.push(edgeLine(g, e));
  const header = `Board graph (${g.nodes.size} nodes) | BFS depth=${depth} | Start: ${starts.map((n) => nodeRef(n)).join(", ")} | ${order.length} nodes found`;
  return emit(header, lines, opts.budget ?? 2000);
}

function findNode(g: BoardGraph, ref: string): GNode | string {
  const r = ref.trim();
  const card = resolveBug(r);
  if (card && g.nodes.has(`card:${card.id}`)) return g.nodes.get(`card:${card.id}`)!;
  const direct = g.nodes.get(r) ?? g.nodes.get(`file:${r}`) ?? g.nodes.get(`sym:${r}`);
  if (direct) return direct;
  const low = r.toLowerCase();
  const hits = [...g.nodes.values()].filter(
    (n) => n.kind !== "sheet" && (n.label.toLowerCase() === low || n.label.toLowerCase().endsWith(`/${low}`)),
  );
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return `Ambiguous "${ref}":\n${hits.slice(0, 10).map((n) => `  ${nodeLine(n)}`).join("\n")}`;
  const part = [...g.nodes.values()].filter((n) => n.kind !== "sheet" && n.label.toLowerCase().includes(low));
  if (part.length === 1) return part[0];
  if (part.length > 1) return `Ambiguous "${ref}":\n${part.slice(0, 10).map((n) => `  ${nodeLine(n)}`).join("\n")}`;
  return `No node matches "${ref}".`;
}

export function boardExplain(ref: string, budget = 2000): string {
  const g = getGraph();
  const n = findNode(g, ref);
  if (typeof n === "string") return n;
  const groups = new Map<string, string[]>();
  for (const e of g.adj.get(n.id) ?? []) {
    const other = g.nodes.get(e.a === n.id ? e.b : e.a)!;
    const arrow = e.a === n.id ? "-->" : "<--";
    const key = `${e.rel}${e.inferred ? " (inferred)" : ""}`;
    const list = groups.get(key) ?? [];
    list.push(`  ${arrow} ${nodeLine(other)}${e.detail && e.inferred ? ` {${e.detail}}` : ""}`);
    groups.set(key, list);
  }
  const lines: string[] = [];
  for (const [k, v] of groups) {
    lines.push(`${k} (${v.length}):`);
    lines.push(...v);
  }
  const header = `Node: ${nodeLine(n)}\n  ID: ${n.id}${n.bug ? `\n  Sheet: ${n.bug.sheet_id}` : ""}\n  Degree: ${g.adj.get(n.id)?.length ?? 0}`;
  return emit(header, lines, budget);
}

export function boardPath(a: string, b: string, budget = 2000): string {
  const g = getGraph();
  const na = findNode(g, a);
  if (typeof na === "string") return na;
  const nb = findNode(g, b);
  if (typeof nb === "string") return nb;
  const prev = new Map<string, { from: string; e: GEdge }>();
  const seen = new Set([na.id]);
  let frontier = [na.id];
  while (frontier.length && !seen.has(nb.id)) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of g.adj.get(id) ?? []) {
        const o = e.a === id ? e.b : e.a;
        if (seen.has(o)) continue;
        // sheets and repos are hubs; only pass through them when they are an endpoint
        const on = g.nodes.get(o)!;
        if ((on.kind === "sheet" || on.kind === "repo") && o !== nb.id) continue;
        seen.add(o);
        prev.set(o, { from: id, e });
        next.push(o);
      }
    }
    frontier = next;
  }
  if (!seen.has(nb.id)) return `No path between ${nodeRef(na)} and ${nodeRef(nb)}.`;
  const hops: string[] = [];
  let cur = nb.id;
  while (cur !== na.id) {
    const p = prev.get(cur)!;
    const from = g.nodes.get(p.from)!;
    const to = g.nodes.get(cur)!;
    const dir = p.e.a === p.from ? `--${p.e.rel}-->` : `<--${p.e.rel}--`;
    hops.unshift(`  ${nodeRef(from)} ${dir} ${nodeRef(to)}${p.e.inferred ? " [INFERRED]" : ""}`);
    cur = p.from;
  }
  return emit(`Shortest path (${hops.length} hops):`, hops, budget);
}

export function boardClusters(sheetId: string, budget = 2000): string {
  const g = getGraph();
  const cards = [...g.nodes.values()].filter((n) => n.bug && n.sheet_id === sheetId);
  if (cards.length === 0) return "No cards on this sheet.";
  // union-find over cards, joined by shared code, explicit links, similar titles (not parent edges)
  const parent = new Map(cards.map((c) => [c.id, c.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const reasons = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (!["shares_code", "similar_title", "related", "depends_on", "duplicate", "regression_of", "same_flow"].includes(e.rel)) continue;
    if (!parent.has(e.a) || !parent.has(e.b)) continue;
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map<string, GNode[]>();
  for (const c of cards) {
    const r = find(c.id);
    const l = groups.get(r) ?? [];
    l.push(c);
    groups.set(r, l);
  }
  const lines: string[] = [];
  let k = 0;
  const multi = [...groups.values()].filter((v) => v.length > 1).sort((x, y) => y.length - x.length);
  const single = [...groups.values()].filter((v) => v.length === 1);
  for (const members of multi) {
    k++;
    const ids = new Set(members.map((m) => m.id));
    const why = new Set<string>();
    for (const e of g.edges) {
      if (!ids.has(e.a) || !ids.has(e.b)) continue;
      if (e.rel === "shares_code") why.add(`code:${e.detail ?? ""}`);
      else if (e.rel === "similar_title") why.add("title");
      else if (["related", "depends_on", "duplicate", "regression_of", "same_flow"].includes(e.rel)) why.add(e.rel);
    }
    void reasons;
    // suggested journey: existing parent shared by most, else name from common tokens
    const parents = new Map<string, number>();
    for (const m of members) {
      const pid = m.bug!.parent_id ?? (m.bug!.kind === "journey" ? m.bug!.id : null);
      if (pid) parents.set(pid, (parents.get(pid) ?? 0) + 1);
    }
    const parentIds = [...parents.keys()];
    const common = [...members.map((m) => tokens(m.bug!.title))].reduce((acc, t) => new Set([...acc].filter((x) => t.has(x))));
    const names = [...(common.size ? common : tokens(members[0].bug!.title))].slice(0, 4).join(" ");
    let suggest: string;
    if (parentIds.length === 1) {
      const j = g.nodes.get(`card:${parentIds[0]}`)?.bug;
      suggest = `journey #${j?.n} ${j?.title}`;
    } else {
      suggest = `new journey "${names}"${parentIds.length > 1 ? ` (merge from ${parentIds.length} journeys)` : ""}`;
    }
    lines.push(`CLUSTER ${k} (${members.length} cards) why=${[...why].slice(0, 4).join("; ")} -> suggest ${suggest}`);
    for (const m of members) lines.push(`  ${nodeLine(m)}`);
  }
  if (single.length) lines.push(`UNGROUPED (${single.length}): ${single.map((s) => `#${s[0].bug!.n}`).join(" ")}`);
  const header = `Clusters for sheet ${sheetId}: ${multi.length} groups, ${single.length} ungrouped, ${cards.length} cards`;
  return emit(header, lines, budget);
}
