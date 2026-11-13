import type { Bug } from "./api";

function shortLine(s: string, max = 120): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function buildFailAiPrompt(sheetName: string, bug: Bug, motivo: string): string {
  const lines: string[] = [
    `Bugboard · aba "${sheetName}" · #${bug.n} ${bug.title}`,
    "Status: falhou",
    `Motivo: ${motivo.trim()}`,
  ];
  if (bug.repos.length > 0) {
    lines.push(`Repos: ${bug.repos.join(", ")}`);
  }
  if (bug.where.trim()) {
    lines.push(`Onde: ${shortLine(bug.where)}`);
  }
  if (bug.steps.length > 0) {
    const stepsBrief = bug.steps.map((s) => shortLine(s, 80)).join("; ");
    lines.push(`Passos: ${shortLine(stepsBrief, 200)}`);
  }
  lines.push("", "Corrige esse card. Quando pronto, deixa em testar.");
  return lines.join("\n");
}
