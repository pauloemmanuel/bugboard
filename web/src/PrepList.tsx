import { CopyButton } from "./CopyButton";
import { parsePrepLine } from "./prepLine";

export function PrepList({ lines }: { lines: string[] }) {
  return (
    <ul className="prep-list">
      {lines.map((line, i) => {
        const parsed = parsePrepLine(line);
        if (parsed.kind === "structured") {
          const copyLabel =
            parsed.key === "email"
              ? "Copiar e-mail"
              : parsed.key === "senha"
                ? "Copiar senha"
                : "Copiar ambiente";
          return (
            <li key={i} className="prep-row prep-row-structured">
              <span className="prep-key">{parsed.label}</span>
              <span className="prep-value">{parsed.value}</span>
              <CopyButton text={parsed.value} label={copyLabel} />
            </li>
          );
        }
        return (
          <li key={i} className="prep-row prep-row-plain">
            <span className="prep-plain-text">{parsed.text}</span>
            <CopyButton text={parsed.text} label="Copiar linha" compact />
          </li>
        );
      })}
    </ul>
  );
}
