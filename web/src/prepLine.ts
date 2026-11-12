const STRUCTURED_PREP =
  /^(E-?mail|Senha|Password|Ambiente)\s*:\s*(.+)$/i;

export type StructuredPrepKey = "email" | "senha" | "ambiente";

export type ParsedPrepLine =
  | { kind: "structured"; key: StructuredPrepKey; label: string; value: string }
  | { kind: "plain"; text: string };

const KEY_LABELS: Record<StructuredPrepKey, string> = {
  email: "E-mail",
  senha: "Senha",
  ambiente: "Ambiente",
};

function normalizeKey(raw: string): StructuredPrepKey | null {
  const k = raw.toLowerCase().replace(/-/g, "");
  if (k === "email") return "email";
  if (k === "senha" || k === "password") return "senha";
  if (k === "ambiente") return "ambiente";
  return null;
}

export function parsePrepLine(line: string): ParsedPrepLine {
  const m = line.trim().match(STRUCTURED_PREP);
  if (!m) return { kind: "plain", text: line };
  const key = normalizeKey(m[1]);
  if (!key) return { kind: "plain", text: line };
  return {
    kind: "structured",
    key,
    label: KEY_LABELS[key],
    value: m[2].trim(),
  };
}
