import type { Bug } from "./api";
import { attachmentLines, type AttachmentRef } from "./imageTokens";

function shortLine(s: string, max = 120): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Prompt the tester pastes into an AI chat after a failed check.
 * Always English and compact: the agent gets the card id for bug_get, so the
 * prompt only carries what it needs to start (reason, where, short steps).
 */
export function buildFailAiPrompt(sheetName: string, bug: Bug, motivo: string, atts: AttachmentRef[] = []): string {
  const lines: string[] = [
    `Bugboard card #${bug.n} FAILED QA (sheet "${sheetName}", round ${bug.round}, id ${bug.id})`,
    `Title: ${bug.title}`,
    `Reason: ${motivo.trim()}`,
  ];
  lines.push(...attachmentLines(motivo, atts));
  if (bug.repos.length > 0) lines.push(`Repos: ${bug.repos.join(", ")}`);
  if (bug.where.trim()) lines.push(`Where: ${shortLine(bug.where)}`);
  if (bug.steps.length > 0) {
    const steps = bug.steps.map((s, i) => `${i + 1}. ${shortLine(s, 80)}`).join(" ");
    lines.push(`Steps: ${shortLine(steps, 240)}`);
  }
  lines.push("", "Task: fix the reason above (bug_get for the full card), then set the card status to testar.");
  return lines.join("\n");
}
