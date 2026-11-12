export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sheets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  title TEXT NOT NULL,
  repos TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'fazendo',
  where_text TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  fix TEXT NOT NULL DEFAULT '',
  round INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(sheet_id, n)
);

CREATE INDEX IF NOT EXISTS idx_bugs_sheet ON bugs(sheet_id);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
`;
