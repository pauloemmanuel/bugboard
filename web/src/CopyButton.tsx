import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyButton({
  text,
  label,
  compact,
}: {
  text: string;
  label: string;
  compact?: boolean;
}) {
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
      aria-label={copied ? "Copiado" : label}
      title={copied ? "Copiado" : label}
    >
      {copied ? (
        <>
          <Check size={compact ? 14 : 16} strokeWidth={2.5} aria-hidden />
          {!compact && <span className="copy-btn-text">Copiado</span>}
        </>
      ) : (
        <>
          <Copy size={compact ? 14 : 16} strokeWidth={2.5} aria-hidden />
          {!compact && <span className="copy-btn-text">Copiar</span>}
        </>
      )}
    </button>
  );
}
