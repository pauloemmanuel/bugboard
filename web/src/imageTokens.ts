export interface AttachmentRef {
  n: number;
  path: string;
}

export const tokenFor = (n: number) => `[Imagem #${n}]`;

/** Insert "[Imagem #N]" at the cursor; returns new text and cursor. */
export function insertToken(text: string, cursor: number, n: number): { text: string; cursor: number } {
  const at = Math.max(0, Math.min(cursor, text.length));
  const tok = tokenFor(n);
  const before = text.slice(0, at);
  const pad = before && !/\s$/.test(before) ? " " : "";
  const after = text.slice(at);
  const ins = pad + tok + (/^\s/.test(after) ? "" : " ");
  return { text: before + ins + after, cursor: at + ins.length };
}

export function removeToken(text: string, n: number): string {
  return text
    .replace(new RegExp(`\\s?\\[Imagem #${n}\\]`, "g"), "")
    .replace(/[ \t]{2,}/g, " ");
}

export function tokensIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\[Imagem #(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/** One `[Imagem #N]: /abs/path` line per token used in the text. */
export function attachmentLines(text: string, atts: AttachmentRef[]): string[] {
  const lines: string[] = [];
  for (const n of tokensIn(text)) {
    const a = atts.find((x) => x.n === n);
    if (a) lines.push(`${tokenFor(n)}: ${a.path}`);
  }
  return lines;
}
