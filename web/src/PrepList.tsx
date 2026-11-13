import { CopyChip } from "./CopyButton";
import { groupPrepRows } from "./prepCopy";
import { prepLinesForDisplay } from "./prepLine";

const KIND_LABEL = {
  email: "e-mail",
  senha: "senha",
  url: "URL",
  comando: "comando",
  id: "id",
} as const;

export function PrepList({ lines }: { lines: string[] }) {
  const rows = groupPrepRows(prepLinesForDisplay(lines));
  return (
    <ul className="prep-list">
      {rows.map((row, i) => (
        <li key={i} className="prep-row prep-row-structured">
          <span className="prep-key">{row.label}</span>
          {row.text ? <span className="prep-plain-text">{row.text}</span> : null}
          {row.values.length > 0 && (
            <span className="prep-chips">
              {row.values.map((v) => (
                <CopyChip key={`${v.kind}:${v.value}`} text={v.value} label={KIND_LABEL[v.kind]} />
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
