export type CopyKind = "email" | "senha" | "url" | "comando" | "id";

export interface CopyValue {
  kind: CopyKind;
  value: string;
}

export interface PrepRow {
  label: string;
  /** Plain text left after removing copyable values (notes, free text). */
  text: string;
  values: CopyValue[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /https?:\/\/[^\s)`]+/;
const CMD_START = /^(make|npm|npx|yarn|pnpm|php|docker|git|cd|curl|node|\.\/|sudo|brew|artisan)\b/;

function push(values: CopyValue[], kind: CopyKind, value: string) {
  const v = value.trim().replace(/[.,;]+$/, "");
  if (v && !values.some((x) => x.kind === kind && x.value === v)) values.push({ kind, value: v });
}

/** One prep line to label + copyable values. Parenthetical notes are never copied. */
export function parsePrepCopy(line: string): PrepRow {
  let rest = line.trim();
  const values: CopyValue[] = [];

  rest = rest.replace(/`([^`]+)`/g, (_m, c: string) => {
    push(values, "comando", c);
    return "";
  });
  rest = rest.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
    if (CMD_START.test(inner.trim())) push(values, "comando", inner);
    return "";
  });

  let label = "";
  const colon = rest.match(/^([^:/@]{1,30}):\s*(.*)$/);
  if (colon && !/^https?$/i.test(colon[1])) {
    label = colon[1].trim();
    rest = colon[2];
  }
  const labelKey = label.toLowerCase().replace(/-/g, "");

  rest = rest.replace(new RegExp(`(${EMAIL.source})(?:\\s+/\\s+(\\S+))?`, "g"), (_m, e: string, pw?: string) => {
    push(values, "email", e);
    if (pw) push(values, "senha", pw);
    return "";
  });
  rest = rest.replace(new RegExp(URL_RE.source, "g"), (u) => {
    push(values, "url", u);
    return "";
  });
  rest = rest.replace(/\b(id|token|uuid)\s*[:=]\s*(\S+)/gi, (_m, _k: string, v: string) => {
    push(values, "id", v);
    return "";
  });

  rest = rest.replace(/[\s/,;]+$/g, "").replace(/\s{2,}/g, " ").trim();
  if (values.length === 0 && rest && (labelKey === "senha" || labelKey === "password")) {
    push(values, "senha", rest);
    rest = "";
  }
  if (!label) {
    label = rest;
    rest = "";
  }
  return { label, text: rest, values };
}

/** Group lines into one row per label, values side by side. */
export function groupPrepRows(lines: string[]): PrepRow[] {
  const rows: PrepRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const r = parsePrepCopy(line);
    const hit = rows.find((x) => x.label.toLowerCase() === r.label.toLowerCase());
    if (hit) {
      for (const v of r.values) push(hit.values, v.kind, v.value);
      if (r.text) hit.text = [hit.text, r.text].filter(Boolean).join(" ");
    } else rows.push(r);
  }
  return rows;
}
