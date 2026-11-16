import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n";

export function CopyButton({
  text,
  label,
  compact,
}: {
  text: string;
  label: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    };
  }, []);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (resetRef.current) clearTimeout(resetRef.current);
      resetRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn${compact ? " copy-btn-compact" : ""}${copied ? " copied" : ""}`}
      onClick={() => void onCopy()}
      aria-label={copied ? t("copied") : label}
      title={copied ? t("copied") : label}
    >
      {copied ? (
        <>
          <Check size={compact ? 14 : 16} strokeWidth={2.5} aria-hidden />
          {!compact && <span className="copy-btn-text">{t("copied")}</span>}
        </>
      ) : (
        <>
          <Copy size={compact ? 14 : 16} strokeWidth={2.5} aria-hidden />
          {!compact && <span className="copy-btn-text">{t("copy")}</span>}
        </>
      )}
    </button>
  );
}

export function CopyChip({ text, label }: { text: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }
  return (
    <button
      type="button"
      className={`copy-chip${copied ? " copied" : ""}`}
      onClick={() => void onCopy()}
      title={text}
      aria-label={t("copyItem", { label })}
    >
      {copied ? <Check size={13} strokeWidth={2.5} aria-hidden /> : <Copy size={13} strokeWidth={2.5} aria-hidden />}
      <span>{label}</span>
    </button>
  );
}
