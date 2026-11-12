import { useCallback, useEffect, useState } from "react";
import type { Bug, BugStatus, Sheet, Stats } from "./api";
import {
  createSheet,
  failBug,
  fetchBugs,
  fetchSheets,
  fetchStats,
  passBug,
  patchBug,
} from "./api";

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

  const visible = bugs.filter((b) => (filter === "todos" ? true : b.status === filter));

  async function onCreateSheet() {
    const name = newSheetName.trim();
    if (!name) return;
    const sheet = await createSheet(name);
    setNewSheetName("");
    setShowNewSheet(false);
    await reload(sheet.id);
  }

  async function onReadyToTest(bug: Bug) {
    await patchBug(bug.id, { status: "testar" });
    await reload(activeSheetId);
  }

  async function onReopen(bug: Bug) {
    await patchBug(bug.id, { status: "fazendo" });
    await reload(activeSheetId);
  }

  async function onPass(bug: Bug) {
    await passBug(bug.id);
    await reload(activeSheetId);
  }

  async function onFail(bug: Bug) {
    await failBug(bug.id);
    await reload(activeSheetId);
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
        <div className="tabs">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tab${s.id === activeSheetId ? " active" : ""}`}
              onClick={() => void reload(s.id)}
            >
              {s.name}
            </button>
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
            {visible.map((bug) => (
              <article key={bug.id} className="card">
                <div className="card-head">
                  <div className="card-title">
                    #{bug.n} {bug.title}
                    {bug.round > 1 ? ` (rodada ${bug.round})` : ""}
                  </div>
                  <span className={`badge ${bug.status}`}>{STATUS_LABEL[bug.status]}</span>
                </div>
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
                <div className="actions">
                  {bug.status === "testar" && (
                    <>
                      <button type="button" className="btn primary" onClick={() => void onPass(bug)}>
                        Passou
                      </button>
                      <button type="button" className="btn danger" onClick={() => void onFail(bug)}>
                        Falhou
                      </button>
                    </>
                  )}
                  {bug.status === "fazendo" && (
                    <button type="button" className="btn primary" onClick={() => void onReadyToTest(bug)}>
                      Pronto pra testar
                    </button>
                  )}
                  {bug.status === "falhou" && (
                    <button type="button" className="btn" onClick={() => void onReopen(bug)}>
                      Reabrir
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
