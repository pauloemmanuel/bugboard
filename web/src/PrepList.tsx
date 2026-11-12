import { CopyButton } from "./CopyButton";
import { parsePrepLine, prepLinesForDisplay } from "./prepLine";

export function PrepList({ lines }: { lines: string[] }) {
  const visible = prepLinesForDisplay(lines);
  return (
    <ul className="prep-list">
      {visible.map((line, i) => {
        const parsed = parsePrepLine(line);
        if (parsed.kind === "structured") {
          if (parsed.key === "ambiente") return null;
          const copyLabel =
            parsed.key === "email" ? "Copiar e-mail" : "Copiar senha";
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
