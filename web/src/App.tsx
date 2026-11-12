import { Check, CircleDashed, Eye, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Bug, BugStatus, Sheet, Stats } from "./api";
import {
  archiveSheet,
  createSheet,
  failBug,
  fetchBugs,
  fetchSheets,
  fetchStats,
  passBug,
  patchBug,
} from "./api";
import { PlatformIcon } from "./PlatformIcon";

type Filter = "todos" | BugStatus;

const FILTER_LABELS: Record<Filter, string> = {
  todos: "Todos",
  fazendo: "Fazendo",
  testar: "Testar",
  ok: "Ok",
  falhou: "Falhou",
};

const STATUS_LABEL: Record<BugStatus, string> = {
  fazendo: "Fazendo",
  testar: "Testar",
  ok: "Ok",
  falhou: "Falhou",
};

const STATUS_ICON: Record<BugStatus, typeof Check> = {
  fazendo: CircleDashed,
  testar: Eye,
  ok: Check,
  falhou: X,
};

function StatusBadge({ status }: { status: BugStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge ${status}`}>
      <Icon size={14} strokeWidth={2.5} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

function childProgressText(bug: Bug): string | null {
  const kids = bug.children?.filter((c) => c.kind === "usecase") ?? [];
  if (kids.length === 0) return null;
  const ok = kids.filter((c) => c.status === "ok").length;
  return `${ok}/${kids.length} ok`;
}

function filterJourneys(journeys: Bug[], filter: Filter): Bug[] {
  if (filter === "todos") return journeys;
  return journeys
    .map((j) => {
      const matchingKids = (j.children ?? []).filter((c) => c.status === filter);
      const journeyMatches = j.status === filter;
      if (!journeyMatches && matchingKids.length === 0) return null;
      return { ...j, children: matchingKids };
    })
    .filter((j): j is Bug => j !== null);
}

function CardActions({
  bug,
  onReady,
  onReopen,
  onPass,
  onFail,
}: {
  bug: Bug;
  onReady: () => void;
  onReopen: () => void;
  onPass: () => void;
  onFail: () => void;
}) {
  return (
    <div className="actions">
      {bug.status === "testar" && (
        <>
          <button type="button" className="btn primary" onClick={onPass}>
            Passou
          </button>
          <button type="button" className="btn danger" onClick={onFail}>
            Falhou
          </button>
        </>
      )}
      {bug.status === "fazendo" && (
        <button type="button" className="btn primary" onClick={onReady}>
          Pronto pra testar
        </button>
      )}
      {bug.status === "falhou" && (
        <button type="button" className="btn" onClick={onReopen}>
          Reabrir
        </button>
      )}
    </div>
  );
}

function BugCardBody({ bug }: { bug: Bug }) {
  return (
    <>
      {bug.repos.length > 0 && (
        <div className="card-section">
          <div className="section-label">Repos</div>
          <ul className="repo-chips" aria-label="Repositórios">
            {bug.repos.map((repo) => (
              <li key={repo} className="repo-chip">
                {repo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {bug.kind === "usecase" && (
        <div className="card-section">
          <div className="section-label">Preparação</div>
          {bug.prep.length > 0 ? (
            <ul className="prep-list">
              {bug.prep.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="section-body muted-hint">Sem preparação neste card.</p>
          )}
        </div>
      )}
      {bug.where && (
        <div className="card-section">
          <div className="section-label">Onde</div>
          <p className="section-body">{bug.where}</p>
        </div>
      )}
      {bug.steps.length > 0 && (
        <div className="card-section">
          <div className="section-label">Passos</div>
          <ol className="steps">
            {bug.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {bug.fix && (
        <div className="card-section">
          <div className="section-label">Correção</div>
          <p className="section-body">{bug.fix}</p>
        </div>
      )}
      {bug.note && (
        <div className="card-section">
          <div className="section-label">Nota</div>
          <p className="section-body">{bug.note}</p>
        </div>
      )}
    </>
  );
}

function UseCaseCard({
  bug,
  handlers,
}: {
  bug: Bug;
  handlers: {
    onReady: (b: Bug) => void;
    onReopen: (b: Bug) => void;
    onPass: (b: Bug) => void;
    onFail: (b: Bug) => void;
  };
}) {
  return (
    <article className="card card-child">
      <div className="card-head">
        <div className="card-title">
          <span className="uc-n">#{bug.n}</span> {bug.title}
          {bug.round > 1 ? ` (rodada ${bug.round})` : ""}
        </div>
        <StatusBadge status={bug.status} />
      </div>
      <BugCardBody bug={bug} />
      <CardActions
        bug={bug}
        onReady={() => handlers.onReady(bug)}
        onReopen={() => handlers.onReopen(bug)}
        onPass={() => handlers.onPass(bug)}
        onFail={() => handlers.onFail(bug)}
      />
    </article>
  );
}

function JourneyCard({
  bug,
  handlers,
}: {
  bug: Bug;
  handlers: {
    onReady: (b: Bug) => void;
    onReopen: (b: Bug) => void;
    onPass: (b: Bug) => void;
    onFail: (b: Bug) => void;
  };
}) {
  const progress = childProgressText(bug);
  const platform = bug.platform;
  const children = bug.children ?? [];

  return (
    <article className="card card-journey">
      <div className="card-head">
        <div className="card-title journey-title">
          <PlatformIcon platform={platform} />
          <span>
            #{bug.n} {bug.title}
            {bug.round > 1 ? ` (rodada ${bug.round})` : ""}
          </span>
        </div>
        <div className="head-badges">
          {progress && <span className="progress-chip">{progress}</span>}
          <StatusBadge status={bug.status} />
        </div>
      </div>
      <BugCardBody bug={bug} />
      <CardActions
        bug={bug}
        onReady={() => handlers.onReady(bug)}
        onReopen={() => handlers.onReopen(bug)}
        onPass={() => handlers.onPass(bug)}
        onFail={() => handlers.onFail(bug)}
      />
      {children.length > 0 && (
        <div className="child-stack">
          {children.map((child) => (
            <UseCaseCard key={child.id} bug={child} handlers={handlers} />
          ))}
        </div>
      )}
    </article>
  );
}

function ArchiveSheetDialog({
  sheet,
  busy,
  onConfirm,
  onCancel,
}: {
  sheet: Sheet | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (sheet && !el.open) el.showModal();
    if (!sheet && el.open) el.close();
  }, [sheet]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="archive-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="archive-sheet-title">Arquivar aba?</h2>
      <p>
        A aba <strong>{sheet?.name}</strong> sai da lista de abas.
      </p>
      <div className="inline-form">
        <button type="button" className="btn" onClick={onCancel} disabled={busy} autoFocus>
          Cancelar
        </button>
        <button type="button" className="btn danger" onClick={onConfirm} disabled={busy}>
          Arquivar aba
        </button>
      </div>
    </dialog>
  );
}

export function App() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [newSheetName, setNewSheetName] = useState("");
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetToArchive, setSheetToArchive] = useState<Sheet | null>(null);
  const [archiving, setArchiving] = useState(false);
  const activeRef = useRef<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const pendingTabFocus = useRef(false);
  activeRef.current = activeSheetId;

  const reload = useCallback(async (sheetId: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchSheets();
      setSheets(s);
      const sid = sheetId && s.some((x) => x.id === sheetId) ? sheetId : (s[0]?.id ?? null);
      setActiveSheetId(sid);
      if (sid) {
        const [b, st] = await Promise.all([fetchBugs(sid), fetchStats(sid)]);
        setBugs(b);
        setStats(st);
      } else {
        setBugs([]);
        setStats(await fetchStats());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(null);
  }, [reload]);

  useEffect(() => {
    if (loading || !pendingTabFocus.current) return;
    pendingTabFocus.current = false;
    const root = tabsRef.current;
    const target = root?.querySelector<HTMLElement>(".tab.active") ?? root;
    target?.focus();
  }, [loading, activeSheetId, sheets]);

  const visible = filterJourneys(bugs, filter);

  const handlers = {
    onReady: async (bug: Bug) => {
      await patchBug(bug.id, { status: "testar" });
      await reload(activeSheetId);
    },
    onReopen: async (bug: Bug) => {
      await patchBug(bug.id, { status: "fazendo" });
      await reload(activeSheetId);
    },
    onPass: async (bug: Bug) => {
      await passBug(bug.id);
      await reload(activeSheetId);
    },
    onFail: async (bug: Bug) => {
      await failBug(bug.id);
      await reload(activeSheetId);
    },
  };

  async function onConfirmArchive() {
    if (!sheetToArchive || archiving) return;
    const target = sheetToArchive;
    const idx = sheets.findIndex((s) => s.id === target.id);
    const neighborId = (sheets[idx + 1] ?? sheets[idx - 1])?.id ?? null;
    setArchiving(true);
    try {
      await archiveSheet(target.id);
      const current = activeRef.current;
      pendingTabFocus.current = true;
      setSheetToArchive(null);
      await reload(current === target.id ? neighborId : current);
    } catch {
      setSheetToArchive(null);
      await reload(activeRef.current);
      setError("Não foi possível arquivar a aba. Tente de novo.");
    } finally {
      setArchiving(false);
    }
  }

  async function onCreateSheet() {
    const name = newSheetName.trim();
    if (!name) return;
    const sheet = await createSheet(name);
    setNewSheetName("");
    setShowNewSheet(false);
    await reload(sheet.id);
  }

  return (
    <>
      <header className="board-header">
        <h1>Bugboard</h1>
        {stats && (
          <div className="stats">
            <span>Total: {stats.total}</span>
            <span>Fazendo: {stats.fazendo}</span>
            <span>Testar: {stats.testar}</span>
            <span>Ok: {stats.ok}</span>
            <span>Falhou: {stats.falhou}</span>
          </div>
        )}
      </header>
      <main>
        {error && <p role="alert">{error}</p>}
        <div className="tabs" ref={tabsRef} tabIndex={-1}>
          {sheets.map((s) => (
            <div key={s.id} className={`tab-group${s.id === activeSheetId ? " active" : ""}`}>
              <button
                type="button"
                className={`tab${s.id === activeSheetId ? " active" : ""}`}
                onClick={() => void reload(s.id)}
              >
                {s.name}
              </button>
              <button
                type="button"
                className="tab-close"
                aria-label={`Arquivar aba ${s.name}`}
                title="Arquivar aba"
                onClick={() => setSheetToArchive(s)}
              >
                <X size={14} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          ))}
          {showNewSheet ? (
            <div className="inline-form">
              <input
                type="text"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                placeholder="Nome da aba"
                aria-label="Nome da nova aba"
              />
              <button type="button" className="btn primary" onClick={() => void onCreateSheet()}>
                Criar
              </button>
              <button type="button" className="btn" onClick={() => setShowNewSheet(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" className="tab-new" onClick={() => setShowNewSheet(true)}>
              + Aba
            </button>
          )}
        </div>

        <div className="filters">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`filter${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <p>Carregando...</p>
        ) : visible.length === 0 ? (
          <div className="empty">Nenhum card ainda. Os agentes criam via MCP.</div>
        ) : (
          <div className="cards">
            {visible.map((bug) =>
              bug.kind === "journey" || (bug.children && bug.children.length > 0) ? (
                <JourneyCard key={bug.id} bug={bug} handlers={handlers} />
              ) : (
                <UseCaseCard key={bug.id} bug={bug} handlers={handlers} />
              ),
            )}
          </div>
        )}
      </main>
      <ArchiveSheetDialog
        sheet={sheetToArchive}
        busy={archiving}
        onConfirm={() => void onConfirmArchive()}
        onCancel={() => setSheetToArchive(null)}
      />
    </>
  );
}
