import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { DB_PATH } from "./paths.js";
import { SCHEMA_SQL } from "./schema.js";
import type { BoardStats, Bug, BugRow, BugStatus, Sheet } from "./types.js";

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

export function listBugs(sheetId: string, status?: BugStatus): Bug[] {
  const db = getDb();
  let rows: BugRow[];
  if (status) {
    rows = db
      .prepare("SELECT * FROM bugs WHERE sheet_id = ? AND status = ? ORDER BY n ASC")
      .all(sheetId, status) as BugRow[];
  } else {
    rows = db
      .prepare("SELECT * FROM bugs WHERE sheet_id = ? ORDER BY n ASC")
      .all(sheetId) as BugRow[];
  }
  return rows.map(rowToBug);
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
}

export function createBug(sheetId: string, input: CreateBugInput): Bug | null {
  const db = getDb();
  const sheet = db.prepare("SELECT id FROM sheets WHERE id = ?").get(sheetId);
  if (!sheet) return null;
  const id = randomUUID();
  const n = nextBugN(db, sheetId);
  const t = nowIso();
  const status = input.status ?? "fazendo";
  db.prepare(
    `INSERT INTO bugs (id, sheet_id, n, title, repos, status, where_text, steps, fix, round, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      title = ?, repos = ?, status = ?, where_text = ?, steps = ?, fix = ?, round = ?, note = ?, updated_at = ?
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
