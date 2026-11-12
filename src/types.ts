export type BugStatus = "fazendo" | "testar" | "ok" | "falhou";
export type BugKind = "journey" | "usecase";
export type Platform = "ios" | "android" | "web" | "ipad";

export interface Sheet {
  id: string;
  name: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface BugRow {
  id: string;
  sheet_id: string;
  n: number;
  title: string;
  repos: string;
  status: BugStatus;
  where_text: string;
  steps: string;
  fix: string;
  round: number;
  note: string;
  parent_id: string | null;
  kind: string;
  platform: string | null;
  prep: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface BoardStats {
  total: number;
  fazendo: number;
  testar: number;
  ok: number;
  falhou: number;
}
