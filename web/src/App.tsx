import { Ban, Check, CircleDashed, Eye, Languages, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Bug, BugStatus, Sheet, Stats } from "./api";
import {
  archiveSheet,
  cancelBug,
  createSheet,
  failBug,
  fetchBugs,
  fetchSheets,
  fetchStats,
  passBug,
  patchBug,
} from "./api";
import { PlatformIcon } from "./PlatformIcon";
import { attachmentUrl, deleteAttachment, uploadAttachment } from "./api";
import { insertToken, removeToken, type AttachmentRef } from "./imageTokens";
import { PrepList } from "./PrepList";
import { extractAmbienteFromPrep, prepLinesForDisplay } from "./prepLine";
import { FailAiPromptDialog } from "./FailAiPromptDialog";
import { SectionText } from "./SectionText";
import { LANGS, useI18n, type Lang, type MessageKey } from "./i18n";

type Filter = "todos" | BugStatus;

const POLL_INTERVAL_MS = 2500;

const FILTERS: Filter[] = ["todos", "fazendo", "testar", "ok", "falhou", "cancelado"];

const FILTER_LABEL: Record<Filter, MessageKey> = {
  todos: "all",
  fazendo: "fazendo",
  testar: "testar",
  ok: "ok",
  falhou: "falhou",
  cancelado: "cancelado",
};

const STATUS_ICON: Record<BugStatus, typeof Check> = {
  fazendo: CircleDashed,
  testar: Eye,
  ok: Check,
  falhou: X,
  cancelado: Ban,
};

/** Quick reasons for cancelling a card that no longer makes sense. */
const CANCEL_REASONS: MessageKey[] = ["reasonScreenChanged", "reasonAiWrong", "reasonDuplicate"];

function StatusBadge({ status }: { status: BugStatus }) {
  const { t } = useI18n();
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge ${status}`}>
      <Icon size={14} strokeWidth={2.5} aria-hidden />
      {t(FILTER_LABEL[status])}
    </span>
  );
}

function childProgress(bug: Bug): { ok: number; total: number } | null {
  const kids =
    bug.children?.filter((c) => c.kind === "usecase" && c.status !== "cancelado") ?? [];
  if (kids.length === 0) return null;
  const ok = kids.filter((c) => c.status === "ok").length;
  return { ok, total: kids.length };
}

function filterJourneys(journeys: Bug[], filter: Filter): Bug[] {
  if (filter === "todos") {
    // Cancelled cards no longer make sense; they only show under the Cancelado filter.
    return journeys
      .filter((j) => j.status !== "cancelado")
      .map((j) => ({ ...j, children: (j.children ?? []).filter((c) => c.status !== "cancelado") }));
  }
  return journeys
    .map((j): Bug | null => {
      const matchingKids = (j.children ?? []).filter((c) => c.status === filter);
      const journeyMatches = j.status === filter;
      if (!journeyMatches && matchingKids.length === 0) return null;
      return { ...j, children: matchingKids };
    })
    .filter((j): j is Bug => j !== null);
}

function mergeBugIntoTree(bugs: Bug[], updated: Bug): Bug[] {
  return bugs.map((j) => {
    if (j.id === updated.id) {
      return { ...j, ...updated, children: updated.children ?? j.children };
    }
    if (j.children?.some((c) => c.id === updated.id)) {
      return {
        ...j,
        children: j.children.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
      };
    }
    return j;
  });
}

function patchBugInTree(bugs: Bug[], id: string, patch: Partial<Bug>): Bug[] {
  return bugs.map((j) => {
    if (j.id === id) return { ...j, ...patch };
    if (!j.children?.some((c) => c.id === id)) return j;
    return {
      ...j,
      children: j.children.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
  });
}

function CardActions({
  bug,
  onReady,
  onReopen,
  onPass,
  onFailClick,
  onCancelClick,
}: {
  bug: Bug;
  onReady: () => void;
  onReopen: () => void;
  onPass: () => void;
  onFailClick: () => void;
  onCancelClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="actions">
      {bug.status === "testar" && (
        <>
          <button type="button" className="btn primary" onClick={onPass}>
            {t("pass")}
          </button>
          <button type="button" className="btn danger" onClick={onFailClick}>
            {t("fail")}
          </button>
        </>
      )}
      {bug.status === "fazendo" && (
        <button type="button" className="btn primary" onClick={onReady}>
          {t("readyToTest")}
        </button>
      )}
      {(bug.status === "falhou" || bug.status === "cancelado") && (
        <button type="button" className="btn" onClick={onReopen}>
          {t("reopen")}
        </button>
      )}
      {bug.status !== "ok" && bug.status !== "cancelado" && (
        <button
          type="button"
          className="btn ghost cancel-card"
          onClick={onCancelClick}
          title={t("cancelCardHint")}
        >
          <Ban size={14} strokeWidth={2.5} aria-hidden />
          {t("cancelCard")}
        </button>
      )}
    </div>
  );
}

function AmbienteChip({ value }: { value: string }) {
  const { t } = useI18n();
  return (
    <span className="ambiente-chip" title={t("environment", { v: value })}>
      {value}
    </span>
  );
}

function BugCardBody({ bug }: { bug: Bug }) {
  const { t } = useI18n();
  const prepVisible = prepLinesForDisplay(bug.prep);
  return (
    <>
      {bug.repos.length > 0 && (
        <div className="card-section">
          <div className="section-label">{t("repos")}</div>
          <ul className="repo-chips" aria-label={t("reposAria")}>
            {bug.repos.map((repo) => (
              <li key={repo} className="repo-chip">
                {repo}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(bug.files?.length ?? 0) > 0 && (
        <div className="card-section">
          <div className="section-label">{t("files")}</div>
          <ul className="repo-chips code-chips">
            {bug.files!.map((f) => (
              <li key={f} className="repo-chip" title={f}>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(bug.symbols?.length ?? 0) > 0 && (
        <div className="card-section">
          <div className="section-label">{t("symbols")}</div>
          <ul className="repo-chips code-chips">
            {bug.symbols!.map((x) => (
              <li key={x} className="repo-chip">
                {x}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(bug.links?.length ?? 0) > 0 && (
        <div className="card-section">
          <div className="section-label">{t("related")}</div>
          <ul className="repo-chips">
            {bug.links!.map((l) => (
              <li key={`${l.id}:${l.type}:${l.direction}`}>
                <a
                  className="repo-chip related-chip"
                  href={`#bug-${l.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(`bug-${l.id}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.classList.add("flash");
                    window.setTimeout(() => el?.classList.remove("flash"), 1200);
                  }}
                >
                  {l.type.replace("_", " ")} #{l.n} {l.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {bug.kind === "usecase" && (
        <div className="card-section">
          <div className="section-label">{t("prep")}</div>
          {prepVisible.length > 0 ? (
            <PrepList lines={bug.prep} />
          ) : (
            <p className="section-body muted-hint">{t("noPrep")}</p>
          )}
        </div>
      )}
      {bug.where && (
        <div className="card-section">
          <div className="section-label">{t("where")}</div>
          <SectionText text={bug.where} />
        </div>
      )}
      {bug.steps.length > 0 && (
        <div className="card-section">
          <div className="section-label">{t("steps")}</div>
          <ol className="steps">
            {bug.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {bug.fix && (
        <div className="card-section">
          <div className="section-label">{t("fix")}</div>
          <SectionText text={bug.fix} />
        </div>
      )}
      {bug.note && (
        <div
          className={`card-section${
            bug.status === "falhou" ? " fail-reason" : bug.status === "cancelado" ? " cancel-reason" : ""
          }`}
        >
          <div className="section-label">
            {bug.status === "falhou"
              ? t("whyFailed")
              : bug.status === "cancelado"
                ? t("whyCancelled")
                : t("note")}
          </div>
          <SectionText text={bug.note} />
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
    onFailClick: (b: Bug) => void;
    onCancelClick: (b: Bug) => void;
  };
}) {
  const { t } = useI18n();
  const ambiente = extractAmbienteFromPrep(bug.prep);
  return (
    <article
      className={`card card-child${bug.status === "cancelado" ? " is-cancelled" : ""}`}
      id={`bug-${bug.id}`}
    >
      <div className="card-head">
        <div className="card-title">
          <span className="uc-n">#{bug.n}</span> {bug.title}
          {bug.round > 1 ? ` (${t("round", { n: bug.round })})` : ""}
        </div>
        <div className="head-badges">
          {ambiente ? <AmbienteChip value={ambiente} /> : null}
          <StatusBadge status={bug.status} />
        </div>
      </div>
      <BugCardBody bug={bug} />
      <CardActions
        bug={bug}
        onReady={() => handlers.onReady(bug)}
        onReopen={() => handlers.onReopen(bug)}
        onPass={() => handlers.onPass(bug)}
        onFailClick={() => handlers.onFailClick(bug)}
        onCancelClick={() => handlers.onCancelClick(bug)}
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
    onFailClick: (b: Bug) => void;
    onCancelClick: (b: Bug) => void;
  };
}) {
  const { t } = useI18n();
  const prog = childProgress(bug);
  const progress = prog ? t("progress", prog) : null;
  const platform = bug.platform;
  const children = bug.children ?? [];
  const ambiente = extractAmbienteFromPrep(bug.prep);

  return (
    <article
      className={`card card-journey${bug.status === "cancelado" ? " is-cancelled" : ""}`}
      id={`bug-${bug.id}`}
    >
      <div className="card-head">
        <div className="card-title journey-title">
          <PlatformIcon platform={platform} />
          <span>
            #{bug.n} {bug.title}
            {bug.round > 1 ? ` (${t("round", { n: bug.round })})` : ""}
          </span>
        </div>
        <div className="head-badges">
          {ambiente ? <AmbienteChip value={ambiente} /> : null}
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
        onFailClick={() => handlers.onFailClick(bug)}
        onCancelClick={() => handlers.onCancelClick(bug)}
      />
      {children.length > 0 && (
        <div className="child-stack">
          {children.map((child) => (
            <UseCaseCard
              key={`${child.id}:${child.updated_at ?? ""}`}
              bug={child}
              handlers={handlers}
            />
          ))}
        </div>
      )}
    </article>
  );
}

/** Renders a translated sentence with one {slot} shown in bold. */
function WithStrong({ text, slot, value }: { text: string; slot: string; value: string }) {
  const [before, after = ""] = text.split(`{${slot}}`);
  return (
    <>
      {before}
      <strong>{value}</strong>
      {after}
    </>
  );
}

function WithCard({ text, n }: { text: string; n?: number }) {
  return <WithStrong text={text} slot="card" value={n !== undefined ? `#${n}` : ""} />;
}

function LanguageSelect() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className="lang-select">
      <Languages size={16} strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("language")}>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function FailMotivoDialog({
  bug,
  busy,
  onConfirm,
  onCancel,
}: {
  bug: Bug | null;
  busy: boolean;
  onConfirm: (motivo: string, atts: AttachmentRef[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState("");
  const [atts, setAtts] = useState<AttachmentRef[]>([]);
  const [zoom, setZoom] = useState<AttachmentRef | null>(null);
  const [upError, setUpError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const trimOk = motivo.trim().length > 0;

  useEffect(() => {
    setMotivo("");
    setAtts([]);
    setZoom(null);
    setUpError(null);
  }, [bug?.id]);

  async function addFiles(files: File[]) {
    if (!bug) return;
    setUpError(null);
    for (const f of files) {
      try {
        const a = await uploadAttachment(bug.id, f);
        const pos = taRef.current?.selectionStart ?? motivo.length;
        setAtts((prev) => [...prev, a]);
        setMotivo((prev) => {
          const r = insertToken(prev, pos, a.n);
          requestAnimationFrame(() => taRef.current?.setSelectionRange(r.cursor, r.cursor));
          return r.text;
        });
      } catch {
        setUpError(t("uploadError"));
      }
    }
  }

  function imagesOf(list: DataTransfer | null): File[] {
    return Array.from(list?.files ?? []).filter((f) => f.type.startsWith("image/"));
  }

  function removeAtt(a: AttachmentRef) {
    if (bug) void deleteAttachment(bug.id, a.n);
    setAtts((prev) => prev.filter((x) => x.n !== a.n));
    setMotivo((prev) => removeToken(prev, a.n));
  }

  function cancel() {
    if (bug) for (const a of atts) void deleteAttachment(bug.id, a.n);
    onCancel();
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (bug && !el.open) el.showModal();
    if (!bug && el.open) el.close();
  }, [bug]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog fail-motivo-dialog"
      aria-labelledby="fail-motivo-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) cancel();
      }}
    >
      <h2 id="fail-motivo-title">{t("failTitle")}</h2>
      <p>
        <WithCard text={t("failBody")} n={bug?.n} />
      </p>
      <label className="fail-motivo-field">
        <span className="section-label">{t("reason")}</span>
        <textarea
          value={motivo}
          ref={taRef}
          onChange={(e) => setMotivo(e.target.value)}
          onPaste={(e) => {
            const imgs = imagesOf(e.clipboardData);
            if (imgs.length) {
              e.preventDefault();
              void addFiles(imgs);
            }
          }}
          onDrop={(e) => {
            const imgs = imagesOf(e.dataTransfer);
            if (imgs.length) {
              e.preventDefault();
              void addFiles(imgs);
            }
          }}
          rows={4}
          placeholder={t("failPlaceholder")}
          disabled={busy}
          autoFocus
        />
      </label>
      {upError && <p className="muted-hint">{upError}</p>}
      {bug && atts.length > 0 && (
        <ul className="att-thumbs">
          {atts.map((a) => (
            <li key={a.n} className="att-thumb">
              <button type="button" className="att-img" onClick={() => setZoom(a)} title={t("image", { n: a.n })}>
                <img src={attachmentUrl(bug.id, a.n)} alt={t("image", { n: a.n })} />
              </button>
              <button type="button" className="att-x" aria-label={t("removeImage", { n: a.n })} onClick={() => removeAtt(a)}>
                x
              </button>
            </li>
          ))}
        </ul>
      )}
      {bug && zoom && (
        <div className="att-zoom" onClick={() => setZoom(null)}>
          <img src={attachmentUrl(bug.id, zoom.n)} alt={t("image", { n: zoom.n })} />
        </div>
      )}
      <div className="inline-form">
        <button type="button" className="btn" onClick={cancel} disabled={busy}>
          {t("cancel")}
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy || !trimOk}
          onClick={() => onConfirm(motivo.trim(), atts)}
        >
          {t("markFailed")}
        </button>
      </div>
    </dialog>
  );
}

function CancelCardDialog({
  bug,
  busy,
  onConfirm,
  onCancel,
}: {
  bug: Bug | null;
  busy: boolean;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState("");
  const trimOk = motivo.trim().length > 0;

  useEffect(() => {
    setMotivo("");
  }, [bug?.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (bug && !el.open) el.showModal();
    if (!bug && el.open) el.close();
  }, [bug]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog fail-motivo-dialog"
      aria-labelledby="cancel-card-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="cancel-card-title">{t("cancelTitle")}</h2>
      <p>
        <WithCard text={t("cancelBody")} n={bug?.n} />
      </p>
      <div className="reason-chips" role="group" aria-label={t("quickReasons")}>
        {CANCEL_REASONS.map((key) => {
          const r = t(key);
          return (
            <button
              key={key}
              type="button"
              className={`reason-chip${motivo === r ? " active" : ""}`}
              onClick={() => setMotivo(r)}
              disabled={busy}
            >
              {r}
            </button>
          );
        })}
      </div>
      <label className="fail-motivo-field">
        <span className="section-label">{t("reason")}</span>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder={t("cancelPlaceholder")}
          disabled={busy}
          autoFocus
        />
      </label>
      <div className="inline-form">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {t("back")}
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy || !trimOk}
          onClick={() => onConfirm(motivo.trim())}
        >
          {t("cancelCard")}
        </button>
      </div>
    </dialog>
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
  const { t } = useI18n();
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
      <h2 id="archive-sheet-title">{t("archiveTitle")}</h2>
      <p>
        <WithStrong text={t("archiveBody")} slot="name" value={sheet?.name ?? ""} />
      </p>
      <div className="inline-form">
        <button type="button" className="btn" onClick={onCancel} disabled={busy} autoFocus>
          {t("cancel")}
        </button>
        <button type="button" className="btn danger" onClick={onConfirm} disabled={busy}>
          {t("archiveSheet")}
        </button>
      </div>
    </dialog>
  );
}

export function App() {
  const { t } = useI18n();
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>("todos");
  const [newSheetName, setNewSheetName] = useState("");
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetToArchive, setSheetToArchive] = useState<Sheet | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [failPromptBug, setFailPromptBug] = useState<Bug | null>(null);
  const [failAiFollowUp, setFailAiFollowUp] = useState<{ bug: Bug; motivo: string; atts: AttachmentRef[] } | null>(
    null,
  );
  const [failing, setFailing] = useState(false);
  const [cancelPromptBug, setCancelPromptBug] = useState<Bug | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const activeRef = useRef<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const pendingTabFocus = useRef(false);
  const scrollSnapshot = useRef<number | null>(null);
  const bugsSnapshot = useRef<Bug[] | null>(null);
  const pollInFlight = useRef(false);
  activeRef.current = activeSheetId;

  const markScrollPreserve = useCallback(() => {
    scrollSnapshot.current = window.scrollY;
  }, []);

  useLayoutEffect(() => {
    if (scrollSnapshot.current !== null) {
      const y = scrollSnapshot.current;
      scrollSnapshot.current = null;
      window.scrollTo(0, y);
    }
  }, [bugs, stats, activeSheetId]);

  const loadSheetData = useCallback(
    async (sid: string | null, opts?: { refreshSheets?: boolean; initial?: boolean }) => {
      if (!opts?.initial) markScrollPreserve();
      setError(null);
      try {
        let resolved = sid;
        if (opts?.refreshSheets || opts?.initial) {
          const s = await fetchSheets();
          setSheets(s);
          resolved = sid && s.some((x) => x.id === sid) ? sid : (s[0]?.id ?? null);
        }
        if (resolved !== null) setActiveSheetId(resolved);
        if (resolved) {
          const [b, st] = await Promise.all([fetchBugs(resolved), fetchStats(resolved)]);
          setBugs(b);
          setStats(st);
        } else if (opts?.refreshSheets || opts?.initial) {
          setBugs([]);
          setStats(await fetchStats());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errLoad"));
      } finally {
        if (opts?.initial) setInitialLoading(false);
      }
    },
    [markScrollPreserve],
  );

  const switchSheet = useCallback(
    async (sheetId: string) => {
      if (sheetId === activeSheetId) return;
      setActiveSheetId(sheetId);
      setError(null);
      try {
        const [b, st] = await Promise.all([fetchBugs(sheetId), fetchStats(sheetId)]);
        setBugs(b);
        setStats(st);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errLoad"));
      }
    },
    [activeSheetId, markScrollPreserve],
  );

  const refreshStats = useCallback(async (sid: string | null) => {
    if (!sid) return;
    try {
      setStats(await fetchStats(sid));
    } catch {
      /* keep prior stats */
    }
  }, []);

  const pollBoard = useCallback(async () => {
    if (pollInFlight.current || document.hidden || bugsSnapshot.current) return;
    pollInFlight.current = true;
    const sidAtStart = activeRef.current;
    markScrollPreserve();
    try {
      const s = await fetchSheets();
      setSheets(s);
      let sheetId = sidAtStart;
      if (sheetId && !s.some((x) => x.id === sheetId)) {
        sheetId = s[0]?.id ?? null;
        if (sheetId !== null) setActiveSheetId(sheetId);
        activeRef.current = sheetId;
      }
      if (!sheetId) {
        if (activeRef.current === sidAtStart) {
          setBugs([]);
          setStats(await fetchStats());
        }
        return;
      }
      if (activeRef.current !== sidAtStart && activeRef.current !== sheetId) return;
      const targetId = activeRef.current ?? sheetId;
      const [b, st] = await Promise.all([fetchBugs(targetId), fetchStats(targetId)]);
      if (activeRef.current !== targetId) return;
      setBugs(b);
      setStats(st);
    } catch {
      /* keep prior data on background poll */
    } finally {
      pollInFlight.current = false;
    }
  }, [markScrollPreserve]);

  useEffect(() => {
    void loadSheetData(null, { refreshSheets: true, initial: true });
  }, [loadSheetData]);

  useEffect(() => {
    if (initialLoading) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      if (document.hidden) return;
      void pollBoard();
      timer = setInterval(() => void pollBoard(), POLL_INTERVAL_MS);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initialLoading, pollBoard]);

  useEffect(() => {
    if (initialLoading || !pendingTabFocus.current) return;
    pendingTabFocus.current = false;
    const root = tabsRef.current;
    const target = root?.querySelector<HTMLElement>(".tab.active") ?? root;
    target?.focus();
  }, [initialLoading, activeSheetId, sheets]);

  const visible = filterJourneys(bugs, filter);
  const activeSheetName =
    sheets.find((s) => s.id === activeSheetId)?.name ?? t("noSheet");

  const handlers = {
    onReady: async (bug: Bug) => {
      bugsSnapshot.current = bugs;
      markScrollPreserve();
      setBugs((prev) => patchBugInTree(prev, bug.id, { status: "testar" }));
      try {
        const updated = await patchBug(bug.id, { status: "testar" });
        setBugs((prev) => mergeBugIntoTree(prev, updated));
        await refreshStats(activeSheetId);
      } catch {
        setBugs(bugsSnapshot.current ?? bugs);
        setError(t("errUpdate"));
      } finally {
        bugsSnapshot.current = null;
      }
    },
    onReopen: async (bug: Bug) => {
      bugsSnapshot.current = bugs;
      markScrollPreserve();
      setBugs((prev) => patchBugInTree(prev, bug.id, { status: "fazendo" }));
      try {
        const updated = await patchBug(bug.id, { status: "fazendo" });
        setBugs((prev) => mergeBugIntoTree(prev, updated));
        await refreshStats(activeSheetId);
      } catch {
        setBugs(bugsSnapshot.current ?? bugs);
        setError(t("errUpdate"));
      } finally {
        bugsSnapshot.current = null;
      }
    },
    onPass: async (bug: Bug) => {
      bugsSnapshot.current = bugs;
      markScrollPreserve();
      setBugs((prev) => patchBugInTree(prev, bug.id, { status: "ok" }));
      try {
        const updated = await passBug(bug.id);
        setBugs((prev) => mergeBugIntoTree(prev, updated));
        await refreshStats(activeSheetId);
      } catch {
        setBugs(bugsSnapshot.current ?? bugs);
        setError(t("errPass"));
      } finally {
        bugsSnapshot.current = null;
      }
    },
    onFailClick: (bug: Bug) => {
      setFailPromptBug(bug);
    },
    onCancelClick: (bug: Bug) => {
      setCancelPromptBug(bug);
    },
    onCancelConfirm: async (bug: Bug, motivo: string) => {
      bugsSnapshot.current = bugs;
      markScrollPreserve();
      setCancelling(true);
      setBugs((prev) => patchBugInTree(prev, bug.id, { status: "cancelado", note: motivo }));
      try {
        const updated = await cancelBug(bug.id, motivo);
        setBugs((prev) => mergeBugIntoTree(prev, updated));
        await refreshStats(activeSheetId);
        setCancelPromptBug(null);
      } catch {
        setBugs(bugsSnapshot.current ?? bugs);
        setError(t("errCancel"));
      } finally {
        setCancelling(false);
        bugsSnapshot.current = null;
      }
    },
    onFailConfirm: async (bug: Bug, motivo: string, atts: AttachmentRef[]) => {
      bugsSnapshot.current = bugs;
      markScrollPreserve();
      setFailing(true);
      setBugs((prev) =>
        patchBugInTree(prev, bug.id, { status: "falhou", note: motivo }),
      );
      try {
        const updated = await failBug(bug.id, motivo);
        setBugs((prev) => mergeBugIntoTree(prev, updated));
        await refreshStats(activeSheetId);
        setFailPromptBug(null);
        setFailAiFollowUp({ bug: updated, motivo, atts });
      } catch {
        setBugs(bugsSnapshot.current ?? bugs);
        setError(t("errFail"));
      } finally {
        setFailing(false);
        bugsSnapshot.current = null;
      }
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
      await loadSheetData(current === target.id ? neighborId : current, {
        refreshSheets: true,
      });
    } catch {
      setSheetToArchive(null);
      await loadSheetData(activeRef.current, { refreshSheets: true });
      setError(t("errArchive"));
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
    await loadSheetData(sheet.id, { refreshSheets: true });
  }

  return (
    <>
      <header className="board-header">
        <div className="board-header-top">
          <h1>Bugboard</h1>
          <LanguageSelect />
        </div>
        {stats && (
          <div className="stats">
            <span>{t("total")}: {stats.total}</span>
            <span>{t("fazendo")}: {stats.fazendo}</span>
            <span>{t("testar")}: {stats.testar}</span>
            <span>{t("ok")}: {stats.ok}</span>
            <span>{t("falhou")}: {stats.falhou}</span>
            <span>{t("cancelado")}: {stats.cancelado ?? 0}</span>
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
                onClick={() => void switchSheet(s.id)}
              >
                {s.name}
              </button>
              <button
                type="button"
                className="tab-close"
                aria-label={t("archiveSheetNamed", { name: s.name })}
                title={t("archiveSheet")}
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
                placeholder={t("sheetName")}
                aria-label={t("newSheetName")}
              />
              <button type="button" className="btn primary" onClick={() => void onCreateSheet()}>
                {t("create")}
              </button>
              <button type="button" className="btn" onClick={() => setShowNewSheet(false)}>
                {t("cancel")}
              </button>
            </div>
          ) : (
            <button type="button" className="tab-new" onClick={() => setShowNewSheet(true)}>
              {t("newSheet")}
            </button>
          )}
        </div>

        <div className="filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`filter${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {t(FILTER_LABEL[f])}
            </button>
          ))}
        </div>

        {initialLoading ? (
          <p>{t("loading")}</p>
        ) : visible.length === 0 ? (
          <div className="empty">{t("empty")}</div>
        ) : (
          <div className="cards">
            {visible.map((bug) => {
              const cardKey = `${bug.id}:${bug.updated_at ?? ""}`;
              return bug.kind === "journey" || (bug.children && bug.children.length > 0) ? (
                <JourneyCard key={cardKey} bug={bug} handlers={handlers} />
              ) : (
                <UseCaseCard key={cardKey} bug={bug} handlers={handlers} />
              );
            })}
          </div>
        )}
      </main>
      <FailMotivoDialog
        bug={failPromptBug}
        busy={failing}
        onConfirm={(motivo, atts) => {
          if (failPromptBug) void handlers.onFailConfirm(failPromptBug, motivo, atts);
        }}
        onCancel={() => {
          if (!failing) setFailPromptBug(null);
        }}
      />
      <CancelCardDialog
        bug={cancelPromptBug}
        busy={cancelling}
        onConfirm={(motivo) => {
          if (cancelPromptBug) void handlers.onCancelConfirm(cancelPromptBug, motivo);
        }}
        onCancel={() => {
          if (!cancelling) setCancelPromptBug(null);
        }}
      />
      <ArchiveSheetDialog
        sheet={sheetToArchive}
        busy={archiving}
        onConfirm={() => void onConfirmArchive()}
        onCancel={() => setSheetToArchive(null)}
      />
      <FailAiPromptDialog
        sheetName={activeSheetName}
        bug={failAiFollowUp?.bug ?? null}
        motivo={failAiFollowUp?.motivo ?? ""}
        atts={failAiFollowUp?.atts ?? []}
        onClose={() => setFailAiFollowUp(null)}
      />
    </>
  );
}
