import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DB_PATH, DATA_DIR } from "./paths.js";
import { SCHEMA_SQL } from "./schema.js";
import { LINK_TYPES } from "./types.js";
import type {
  Attachment,
  BoardStats,
  Bug,
  BugKind,
  BugLink,
  BugLinkView,
  BugRow,
  BugStatus,
  LinkType,
  Platform,
  Sheet,
} from "./types.js";

let _db: Database.Database | undefined;

/** Bumped on every write made by this process; the graph cache keys on it. */
let _writeVersion = 0;
export function bumpWrite(): void {
  _writeVersion++;
}
/** Changes when this process or any other process wrote to the DB. */
export function dbVersion(): string {
  const db = getDb();
  const dv = db.pragma("data_version", { simple: true });
  return `${_writeVersion}:${String(dv)}`;
}

function cleanList(v: string[] | undefined): string[] {
  if (!v) return [];
  const seen = new Set<string>();
  for (const x of v) {
    const t = String(x).trim();
    if (t) seen.add(t);
  }
  return [...seen];
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJsonArray(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

const PLATFORMS = new Set<string>(["ios", "android", "web", "ipad"]);

function parsePlatform(raw: string | null): Platform | null {
  if (!raw) return null;
  return PLATFORMS.has(raw) ? (raw as Platform) : null;
}

function inferPlatform(title: string, where: string): Platform | null {
  const blob = `${title} ${where}`.toLowerCase();
  if (/\bipad\b|tablet/.test(blob)) return "ipad";
  if (/\bandroid\b/.test(blob)) return "android";
  if (/\bios\b|iphone|testflight/.test(blob)) return "ios";
  if (/\bweb\b|desktop|browser|chrome/.test(blob)) return "web";
  return null;
}

function bugsTableExists(db: Database.Database): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bugs'")
    .get() as { name: string } | undefined;
  return row !== undefined;
}

function migrateBugsTable(db: Database.Database): void {
  if (!bugsTableExists(db)) return;

  const cols = db.prepare("PRAGMA table_info(bugs)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  let schemaChanged = false;

  if (!names.has("parent_id")) {
    db.exec(
      "ALTER TABLE bugs ADD COLUMN parent_id TEXT NULL REFERENCES bugs(id) ON DELETE CASCADE",
    );
    schemaChanged = true;
  }
  if (!names.has("kind")) {
    db.exec("ALTER TABLE bugs ADD COLUMN kind TEXT NOT NULL DEFAULT 'journey'");
    schemaChanged = true;
  }
  if (!names.has("platform")) {
    db.exec("ALTER TABLE bugs ADD COLUMN platform TEXT NULL");
    schemaChanged = true;
  }
  if (!names.has("prep")) {
    db.exec("ALTER TABLE bugs ADD COLUMN prep TEXT NOT NULL DEFAULT '[]'");
    schemaChanged = true;
  }

  if (!names.has("files")) {
    db.exec("ALTER TABLE bugs ADD COLUMN files TEXT NOT NULL DEFAULT '[]'");
  }
  if (!names.has("symbols")) {
    db.exec("ALTER TABLE bugs ADD COLUMN symbols TEXT NOT NULL DEFAULT '[]'");
  }

  const after = db.prepare("PRAGMA table_info(bugs)").all() as { name: string }[];
  if (after.some((c) => c.name === "parent_id")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_bugs_parent ON bugs(parent_id)");
  }

  if (!schemaChanged) return;

  const rows = db.prepare("SELECT id, title, where_text, parent_id, platform FROM bugs").all() as {
    id: string;
    title: string;
    where_text: string;
    parent_id: string | null;
    platform: string | null;
  }[];
  const updKind = db.prepare("UPDATE bugs SET kind = ? WHERE id = ?");
  const updPlatform = db.prepare("UPDATE bugs SET platform = ? WHERE id = ? AND platform IS NULL");
  for (const row of rows) {
    const kind: BugKind = row.parent_id ? "usecase" : "journey";
    updKind.run(kind, row.id);
    if (!row.parent_id && !row.platform) {
      const plat = inferPlatform(row.title, row.where_text);
      if (plat) updPlatform.run(plat, row.id);
    }
  }
  db.pragma("user_version = 2");
}

export function rowToBug(row: BugRow): Bug {
  return {
    id: row.id,
    sheet_id: row.sheet_id,
    n: row.n,
    title: row.title,
    repos: parseJsonArray(row.repos),
    status: row.status as BugStatus,
    where: row.where_text,
    steps: parseJsonArray(row.steps),
    fix: row.fix,
    round: row.round,
    note: row.note,
    parent_id: row.parent_id ?? null,
    kind: (row.kind === "usecase" ? "usecase" : "journey") as BugKind,
    platform: parsePlatform(row.platform),
    prep: parseJsonArray(row.prep ?? "[]"),
    files: parseJsonArray(row.files ?? "[]"),
    symbols: parseJsonArray(row.symbols ?? "[]"),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getDb(): Database.Database {
  if (_db) return _db;
  mkdirSync(DB_PATH.replace(/\/[^/]+$/, ""), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(SCHEMA_SQL);
  migrateBugsTable(_db);
  seedIfEmpty(_db);
  return _db;
}

function seedIfEmpty(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) AS c FROM sheets").get() as { c: number };
  if (count.c > 0) return;
  const id = randomUUID();
  const t = nowIso();
  db.prepare(
    "INSERT INTO sheets (id, name, archived, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
  ).run(id, "Sessão", t, t);
}

export function listSheets(includeArchived = false): Sheet[] {
  const db = getDb();
  if (includeArchived) {
    return db.prepare("SELECT * FROM sheets ORDER BY archived ASC, created_at ASC").all() as Sheet[];
  }
  return db
    .prepare("SELECT * FROM sheets WHERE archived = 0 ORDER BY created_at ASC")
    .all() as Sheet[];
}

export function createSheet(name: string): Sheet {
  const db = getDb();
  const id = randomUUID();
  const t = nowIso();
  db.prepare(
    "INSERT INTO sheets (id, name, archived, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
  ).run(id, name.trim(), t, t);
  bumpWrite();
  return db.prepare("SELECT * FROM sheets WHERE id = ?").get(id) as Sheet;
}

export function updateSheet(
  id: string,
  patch: { name?: string; archived?: number },
): Sheet | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM sheets WHERE id = ?").get(id) as Sheet | undefined;
  if (!existing) return null;
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const archived = patch.archived !== undefined ? patch.archived : existing.archived;
  const t = nowIso();
  db.prepare("UPDATE sheets SET name = ?, archived = ?, updated_at = ? WHERE id = ?").run(
    name,
    archived,
    t,
    id,
  );
  bumpWrite();
  return db.prepare("SELECT * FROM sheets WHERE id = ?").get(id) as Sheet;
}

function fetchBugRows(db: Database.Database, sheetId: string, status?: BugStatus): BugRow[] {
  if (status) {
    return db
      .prepare("SELECT * FROM bugs WHERE sheet_id = ? AND status = ? ORDER BY n ASC")
      .all(sheetId, status) as BugRow[];
  }
  return db
    .prepare("SELECT * FROM bugs WHERE sheet_id = ? ORDER BY n ASC")
    .all(sheetId) as BugRow[];
}

function bugMatchesFilter(bug: Bug, status?: BugStatus): boolean {
  if (!status) return true;
  return bug.status === status;
}

export function listBugsFlat(sheetId: string, status?: BugStatus): Bug[] {
  const db = getDb();
  return fetchBugRows(db, sheetId, status).map((r) => {
    const b = rowToBug(r);
    b.attachments = listAttachments(b.id);
    return b;
  });
}

export function listBugs(sheetId: string, status?: BugStatus): Bug[] {
  const db = getDb();
  const rows = fetchBugRows(db, sheetId);
  return rows.map(rowToBug);
}

export function listBugsNested(sheetId: string, status?: BugStatus): Bug[] {
  const db = getDb();
  const rows = fetchBugRows(db, sheetId);
  const flat = rows.map(rowToBug);
  const lv = linkViews(db, flat.map((b) => b.id));
  for (const b of flat) {
    b.links = lv.get(b.id) ?? [];
    b.attachments = listAttachments(b.id);
  }
  const byParent = new Map<string | null, Bug[]>();
  for (const b of flat) {
    const key = b.parent_id;
    const list = byParent.get(key) ?? [];
    list.push(b);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.n - b.n);
  }

  const roots = byParent.get(null) ?? [];

  function attachChildren(journey: Bug): Bug {
    const kids = (byParent.get(journey.id) ?? []).map((c) => ({
      ...c,
      platform: c.platform ?? journey.platform,
    }));
    if (!status) {
      return { ...journey, children: kids };
    }
    const matchingKids = kids.filter((c) => bugMatchesFilter(c, status));
    return { ...journey, children: matchingKids };
  }

  const nested = roots.map(attachChildren);

  if (!status) {
    return nested;
  }

  return nested.filter((j) => {
    const kids = j.children ?? [];
    return bugMatchesFilter(j, status) || kids.some((c) => bugMatchesFilter(c, status));
  });
}

export function getBug(id: string): Bug | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM bugs WHERE id = ?").get(id) as BugRow | undefined;
  if (!row) return null;
  const bug = rowToBug(row);
  bug.links = linkViews(db, [id]).get(id) ?? [];
  bug.attachments = listAttachments(id);
  return bug;
}

export function listAllBugs(): Bug[] {
  const db = getDb();
  return (db.prepare("SELECT * FROM bugs ORDER BY sheet_id, n").all() as BugRow[]).map(rowToBug);
}

export function listAllLinks(): BugLink[] {
  return getDb().prepare("SELECT * FROM bug_links").all() as BugLink[];
}

function linkViews(db: Database.Database, ids: string[]): Map<string, BugLinkView[]> {
  const out = new Map<string, BugLinkView[]>();
  if (ids.length === 0) return out;
  const ph = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT l.from_id, l.to_id, l.type, b.id AS oid, b.n, b.title, b.status
       FROM bug_links l
       JOIN bugs b ON b.id = CASE WHEN l.from_id IN (${ph}) THEN l.to_id ELSE l.from_id END
       WHERE l.from_id IN (${ph}) OR l.to_id IN (${ph})`,
    )
    .all(...ids, ...ids, ...ids) as {
    from_id: string;
    to_id: string;
    type: LinkType;
    oid: string;
    n: number;
    title: string;
    status: BugStatus;
  }[];
  const want = new Set(ids);
  for (const r of rows) {
    const add = (self: string, direction: "out" | "in") => {
      const list = out.get(self) ?? [];
      list.push({ id: r.oid, n: r.n, title: r.title, status: r.status, type: r.type, direction });
      out.set(self, list);
    };
    if (want.has(r.from_id)) add(r.from_id, "out");
    if (want.has(r.to_id)) add(r.to_id, "in");
  }
  return out;
}

/** Resolve a card by full id, id prefix (8+ chars) or "#n"/"n" (needs sheetId when ambiguous). */
export function resolveBug(ref: string, sheetId?: string): Bug | null {
  const db = getDb();
  const r = String(ref).trim();
  const byId = db.prepare("SELECT * FROM bugs WHERE id = ?").get(r) as BugRow | undefined;
  if (byId) return rowToBug(byId);
  const m = /^#?(\d+)$/.exec(r);
  if (m) {
    const n = Number(m[1]);
    const rows = (
      sheetId
        ? db.prepare("SELECT * FROM bugs WHERE n = ? AND sheet_id = ?").all(n, sheetId)
        : db.prepare("SELECT * FROM bugs WHERE n = ?").all(n)
    ) as BugRow[];
    return rows.length === 1 ? rowToBug(rows[0]) : null;
  }
  if (r.length >= 8) {
    const rows = db.prepare("SELECT * FROM bugs WHERE id LIKE ?").all(`${r}%`) as BugRow[];
    if (rows.length === 1) return rowToBug(rows[0]);
  }
  return null;
}

export function linkBugs(fromId: string, toId: string, type: LinkType): BugLink | string {
  const db = getDb();
  if (!LINK_TYPES.includes(type)) return `type must be one of ${LINK_TYPES.join(", ")}`;
  if (fromId === toId) return "cannot link a card to itself";
  const t = nowIso();
  db.prepare(
    "INSERT OR IGNORE INTO bug_links (from_id, to_id, type, created_at) VALUES (?, ?, ?, ?)",
  ).run(fromId, toId, type, t);
  bumpWrite();
  return { from_id: fromId, to_id: toId, type, created_at: t };
}

/** Remove a link; without type removes every type between the pair (either direction). */
export function unlinkBugs(aId: string, bId: string, type?: LinkType): number {
  const db = getDb();
  const sql = `DELETE FROM bug_links WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))${
    type ? " AND type = ?" : ""
  }`;
  const args: unknown[] = [aId, bId, bId, aId];
  if (type) args.push(type);
  const n = db.prepare(sql).run(...args).changes;
  if (n) bumpWrite();
  return n;
}

function nextBugN(db: Database.Database, sheetId: string): number {
  const row = db
    .prepare("SELECT MAX(n) AS m FROM bugs WHERE sheet_id = ?")
    .get(sheetId) as { m: number | null };
  return (row.m ?? 0) + 1;
}

export interface CreateBugInput {
  title: string;
  repos?: string[];
  status?: BugStatus;
  where?: string;
  steps?: string[];
  fix?: string;
  round?: number;
  note?: string;
  parent_id?: string | null;
  kind?: BugKind;
  platform?: Platform | null;
  prep?: string[];
  files?: string[];
  symbols?: string[];
}

export function createBug(sheetId: string, input: CreateBugInput): Bug | null {
  const db = getDb();
  const sheet = db.prepare("SELECT id FROM sheets WHERE id = ?").get(sheetId);
  if (!sheet) return null;

  const kind: BugKind = input.kind ?? (input.parent_id ? "usecase" : "journey");
  if (kind === "usecase" && !input.parent_id) {
    return null;
  }
  if (kind === "journey" && input.parent_id) {
    return null;
  }
  if (input.parent_id) {
    const parent = db.prepare("SELECT id, sheet_id FROM bugs WHERE id = ?").get(input.parent_id) as
      | { id: string; sheet_id: string }
      | undefined;
    if (!parent || parent.sheet_id !== sheetId) return null;
  }

  const id = randomUUID();
  const n = nextBugN(db, sheetId);
  const t = nowIso();
  const status = input.status ?? "fazendo";
  db.prepare(
    `INSERT INTO bugs (id, sheet_id, n, title, repos, status, where_text, steps, fix, round, note,
      parent_id, kind, platform, prep, files, symbols, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sheetId,
    n,
    input.title.trim(),
    JSON.stringify(input.repos ?? []),
    status,
    input.where ?? "",
    JSON.stringify(input.steps ?? []),
    input.fix ?? "",
    input.round ?? 1,
    input.note ?? "",
    input.parent_id ?? null,
    kind,
    input.platform ?? null,
    JSON.stringify(input.prep ?? []),
    JSON.stringify(cleanList(input.files)),
    JSON.stringify(cleanList(input.symbols)),
    t,
    t,
  );
  bumpWrite();
  return getBug(id);
}

export interface UpdateBugInput {
  title?: string;
  repos?: string[];
  status?: BugStatus;
  where?: string;
  steps?: string[];
  fix?: string;
  round?: number;
  note?: string;
  platform?: Platform | null;
  prep?: string[];
  files?: string[];
  symbols?: string[];
}

export function updateBug(id: string, input: UpdateBugInput): Bug | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM bugs WHERE id = ?").get(id) as BugRow | undefined;
  if (!existing) return null;

  let round = input.round !== undefined ? input.round : existing.round;
  const nextStatus = input.status;
  if (
    nextStatus === "testar" &&
    (existing.status === "falhou" || existing.status === "ok") &&
    input.round === undefined
  ) {
    round = existing.round + 1;
  }

  const t = nowIso();
  db.prepare(
    `UPDATE bugs SET
      title = ?, repos = ?, status = ?, where_text = ?, steps = ?, fix = ?, round = ?, note = ?,
      platform = ?, prep = ?, files = ?, symbols = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.title !== undefined ? input.title.trim() : existing.title,
    JSON.stringify(input.repos !== undefined ? input.repos : parseJsonArray(existing.repos)),
    nextStatus !== undefined ? nextStatus : existing.status,
    input.where !== undefined ? input.where : existing.where_text,
    JSON.stringify(input.steps !== undefined ? input.steps : parseJsonArray(existing.steps)),
    input.fix !== undefined ? input.fix : existing.fix,
    round,
    input.note !== undefined ? input.note : existing.note,
    input.platform !== undefined ? input.platform : existing.platform,
    JSON.stringify(input.prep !== undefined ? input.prep : parseJsonArray(existing.prep ?? "[]")),
    JSON.stringify(
      input.files !== undefined ? cleanList(input.files) : parseJsonArray(existing.files ?? "[]"),
    ),
    JSON.stringify(
      input.symbols !== undefined
        ? cleanList(input.symbols)
        : parseJsonArray(existing.symbols ?? "[]"),
    ),
    t,
    id,
  );
  bumpWrite();
  return getBug(id);
}

export function passBug(id: string, note?: string): Bug | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM bugs WHERE id = ?").get(id) as BugRow | undefined;
  if (!existing) return null;
  const t = nowIso();
  const nextNote = note !== undefined ? note : existing.note;
  db.prepare("UPDATE bugs SET status = 'ok', note = ?, updated_at = ? WHERE id = ?").run(
    nextNote,
    t,
    id,
  );
  bumpWrite();
  return getBug(id);
}

export function failBug(id: string, note?: string): Bug | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM bugs WHERE id = ?").get(id) as BugRow | undefined;
  if (!existing) return null;
  const t = nowIso();
  const nextNote = note !== undefined ? note : existing.note;
  db.prepare("UPDATE bugs SET status = 'falhou', note = ?, updated_at = ? WHERE id = ?").run(
    nextNote,
    t,
    id,
  );
  bumpWrite();
  return getBug(id);
}

/** Card no longer makes sense (screen changed, AI got the scenario wrong). Reopen with status fazendo. */
export function cancelBug(id: string, note?: string): Bug | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM bugs WHERE id = ?").get(id) as BugRow | undefined;
  if (!existing) return null;
  const nextNote = note !== undefined ? note : existing.note;
  db.prepare("UPDATE bugs SET status = 'cancelado', note = ?, updated_at = ? WHERE id = ?").run(
    nextNote,
    nowIso(),
    id,
  );
  bumpWrite();
  return getBug(id);
}

export function boardStats(sheetId?: string): BoardStats {
  const db = getDb();
  const base = sheetId
    ? "FROM bugs WHERE sheet_id = @sheetId"
    : "FROM bugs";
  const params = sheetId ? { sheetId } : {};
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'fazendo' THEN 1 ELSE 0 END) AS fazendo,
        SUM(CASE WHEN status = 'testar' THEN 1 ELSE 0 END) AS testar,
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok,
        SUM(CASE WHEN status = 'falhou' THEN 1 ELSE 0 END) AS falhou,
        SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) AS cancelado
      ${base}`,
    )
    .get(params) as BoardStats;
  return {
    total: row.total ?? 0,
    fazendo: row.fazendo ?? 0,
    testar: row.testar ?? 0,
    ok: row.ok ?? 0,
    falhou: row.falhou ?? 0,
    cancelado: row.cancelado ?? 0,
  };
}


// ---- attachments -----------------------------------------------------------

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Returns the file extension for an allowed image, or an error string. */
export function validateImageUpload(mime: string, size: number): { ext: string } | { error: string } {
  const ext = MIME_EXT[mime.split(";")[0].trim().toLowerCase()];
  if (!ext) return { error: "only png, jpg and webp" };
  if (size <= 0) return { error: "empty file" };
  if (size > MAX_UPLOAD_BYTES) return { error: "file too large (max 10 MB)" };
  return { ext };
}

export function listAttachments(bugId: string): Attachment[] {
  return getDb()
    .prepare("SELECT n, path, round, created_at FROM bug_attachments WHERE bug_id = ? ORDER BY n")
    .all(bugId) as Attachment[];
}

export function addAttachment(bugId: string, data: Buffer, mime: string): Attachment | string {
  const db = getDb();
  const bug = db.prepare("SELECT round FROM bugs WHERE id = ?").get(bugId) as
    | { round: number }
    | undefined;
  if (!bug) return "not found";
  const v = validateImageUpload(mime, data.length);
  if ("error" in v) return v.error;
  const row = db.prepare("SELECT MAX(n) AS m FROM bug_attachments WHERE bug_id = ?").get(bugId) as {
    m: number | null;
  };
  const n = (row.m ?? 0) + 1;
  const dir = join(DATA_DIR, "uploads", bugId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${n}.${v.ext}`);
  writeFileSync(path, data);
  const t = nowIso();
  db.prepare(
    "INSERT INTO bug_attachments (bug_id, n, path, created_at, round) VALUES (?, ?, ?, ?, ?)",
  ).run(bugId, n, path, t, bug.round);
  bumpWrite();
  return { n, path, round: bug.round, created_at: t };
}

export function removeAttachment(bugId: string, n: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT path FROM bug_attachments WHERE bug_id = ? AND n = ?")
    .get(bugId, n) as { path: string } | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM bug_attachments WHERE bug_id = ? AND n = ?").run(bugId, n);
  rmSync(row.path, { force: true });
  bumpWrite();
  return true;
}
