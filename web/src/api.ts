export type BugStatus = "fazendo" | "testar" | "ok" | "falhou";
export type BugKind = "journey" | "usecase";
export type Platform = "ios" | "android" | "web" | "ipad";

export interface Sheet {
  id: string;
  name: string;
  archived: number;
}

export interface Bug {
  id: string;
  sheet_id: string;
  n: number;
  title: string;
  repos: string[];
  status: BugStatus;
  where: string;
  steps: string[];
  fix: string;
  round: number;
  note: string;
  parent_id: string | null;
  kind: BugKind;
  platform: Platform | null;
  prep: string[];
  children?: Bug[];
}

export interface Stats {
  total: number;
  fazendo: number;
  testar: number;
  ok: number;
  falhou: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function fetchSheets(): Promise<Sheet[]> {
  const data = await json<{ sheets: Sheet[] }>(await fetch("/api/sheets"));
  return data.sheets;
}

export async function createSheet(name: string): Promise<Sheet> {
  const data = await json<{ sheet: Sheet }>(
    await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
  return data.sheet;
}

export async function archiveSheet(id: string): Promise<Sheet> {
  const data = await json<{ sheet: Sheet }>(
    await fetch(`/api/sheets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: 1 }),
    }),
  );
  return data.sheet;
}

export async function fetchBugs(sheetId: string): Promise<Bug[]> {
  const data = await json<{ bugs: Bug[] }>(await fetch(`/api/sheets/${sheetId}/bugs`));
  return data.bugs;
}

export async function fetchStats(sheetId?: string): Promise<Stats> {
  const q = sheetId ? `?sheet_id=${encodeURIComponent(sheetId)}` : "";
  const data = await json<{ stats: Stats }>(await fetch(`/api/stats${q}`));
  return data.stats;
}

export async function patchBug(id: string, body: Record<string, unknown>): Promise<Bug> {
  const data = await json<{ bug: Bug }>(
    await fetch(`/api/bugs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return data.bug;
}

export async function passBug(id: string, note?: string): Promise<Bug> {
  const data = await json<{ bug: Bug }>(
    await fetch(`/api/bugs/${id}/pass`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note ? { note } : {}),
    }),
  );
  return data.bug;
}

export async function failBug(id: string, note?: string): Promise<Bug> {
  const data = await json<{ bug: Bug }>(
    await fetch(`/api/bugs/${id}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note ? { note } : {}),
    }),
  );
  return data.bug;
}
