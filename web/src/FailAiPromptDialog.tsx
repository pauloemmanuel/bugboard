import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Bug } from "./api";
import { buildFailAiPrompt } from "./failAiPrompt";
import type { AttachmentRef } from "./imageTokens";
import { useI18n } from "./i18n";

export function FailAiPromptDialog({
  sheetName,
  bug,
  motivo,
  atts,
  onClose,
}: {
  sheetName: string;
  bug: Bug | null;
  motivo: string;
  atts: AttachmentRef[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prompt =
    bug && motivo ? buildFailAiPrompt(sheetName, bug, motivo, atts) : "";

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (bug && motivo && !el.open) el.showModal();
    if ((!bug || !motivo) && el.open) el.close();
  }, [bug, motivo]);

  useEffect(() => {
    if (!bug) setCopied(false);
  }, [bug?.id]);

  async function onCopy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="confirm-dialog fail-ai-prompt-dialog"
      aria-labelledby="fail-ai-prompt-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2 id="fail-ai-prompt-title">{t("aiTitle")}</h2>
      <p>{t("aiBody")}</p>
      <pre className="fail-ai-prompt-preview" dir="ltr" aria-label={t("aiPreview")}>
        {prompt}
      </pre>
      <div className="inline-form fail-ai-prompt-actions">
        <button
          type="button"
          className={`btn primary copy-prompt-btn${copied ? " copied" : ""}`}
          onClick={() => void onCopy()}
        >
          {copied ? (
            <>
              <Check size={16} strokeWidth={2.5} aria-hidden />
              {t("copied")}
            </>
          ) : (
            <>
              <Copy size={16} strokeWidth={2.5} aria-hidden />
              {t("copyPrompt")}
            </>
          )}
        </button>
        <button type="button" className="btn" onClick={onClose} autoFocus>
          {t("ok_button")}
        </button>
      </div>
    </dialog>
  );
}
