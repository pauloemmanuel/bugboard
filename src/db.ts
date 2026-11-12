import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { DB_PATH } from "./paths.js";
import { SCHEMA_SQL } from "./schema.js";
import type { BoardStats, Bug, BugKind, BugRow, BugStatus, Platform, Sheet } from "./types.js";

let _db: Database.Database | undefined;

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

function migrateBugsTable(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(bugs)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("parent_id")) {
    db.exec("ALTER TABLE bugs ADD COLUMN parent_id TEXT NULL REFERENCES bugs(id) ON DELETE CASCADE");
  }
  if (!names.has("kind")) {
    db.exec("ALTER TABLE bugs ADD COLUMN kind TEXT NOT NULL DEFAULT 'journey'");
  }
  if (!names.has("platform")) {
    db.exec("ALTER TABLE bugs ADD COLUMN platform TEXT NULL");
  }
  if (!names.has("prep")) {
    db.exec("ALTER TABLE bugs ADD COLUMN prep TEXT NOT NULL DEFAULT '[]'");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_bugs_parent ON bugs(parent_id)");
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
  const schemaVer = _db.pragma("user_version", { simple: true }) as number;
  if (schemaVer < 2) {
    migrateBugsTable(_db);
    _db.pragma("user_version = 2");
  }
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

export function listBugs(sheetId: string, status?: BugStatus): Bug[] {
  const db = getDb();
  const rows = fetchBugRows(db, sheetId);
  return rows.map(rowToBug);
}

export function listBugsNested(sheetId: string, status?: BugStatus): Bug[] {
  const db = getDb();
  const rows = fetchBugRows(db, sheetId);
  const flat = rows.map(rowToBug);
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
  return row ? rowToBug(row) : null;
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
      parent_id, kind, platform, prep, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    t,
    t,
  );
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
      platform = ?, prep = ?, updated_at = ?
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
    t,
    id,
  );
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
        SUM(CASE WHEN status = 'falhou' THEN 1 ELSE 0 END) AS falhou
      ${base}`,
    )
    .get(params) as BoardStats;
  return {
    total: row.total ?? 0,
    fazendo: row.fazendo ?? 0,
    testar: row.testar ?? 0,
    ok: row.ok ?? 0,
    falhou: row.falhou ?? 0,
  };
}
