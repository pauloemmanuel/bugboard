import { CopyChip } from "./CopyButton";
import { groupPrepRows } from "./prepCopy";
import { prepLinesForDisplay } from "./prepLine";

import { useI18n, type MessageKey } from "./i18n";

const KIND_LABEL: Record<"email" | "senha" | "url" | "comando" | "id", MessageKey> = {
  email: "kindEmail",
  senha: "kindPassword",
  url: "kindUrl",
  comando: "kindCommand",
  id: "kindId",
};

export function PrepList({ lines }: { lines: string[] }) {
  const { t } = useI18n();
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
                <CopyChip key={`${v.kind}:${v.value}`} text={v.value} label={t(KIND_LABEL[v.kind])} />
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
