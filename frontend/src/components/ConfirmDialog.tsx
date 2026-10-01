import { ReactNode, useEffect, useId, useRef, useState, FormEvent } from "react";
import { btnDangerSolid, btnPrimary, btnSecondary } from "@/lib/ui";

interface Props {
  title: string;
  /** What will happen, in plain words — especially what can't be undone. */
  description?: ReactNode;
  confirmLabel: string;
  /** "danger" makes the confirm button red; use it for anything destructive or that locks someone out. */
  tone?: "danger" | "primary";
  /** Extra controls between the description and the buttons (e.g. a picker). */
  children?: ReactNode;
  /** Adds a text box. The confirm button stays disabled until it has text (unless `optional`). */
  textInput?: { label: string; placeholder?: string; optional?: boolean };
  /** Receives the typed text (trimmed) when `textInput` is set. Return a promise to show the busy state. */
  onConfirm: (text: string) => void | Promise<unknown>;
  onCancel: () => void;
  disabled?: boolean;
}

/**
 * Replaces the browser's confirm()/prompt(): same look as the app's other modals, Escape and
 * click-outside cancel, Cancel is focused by default so Enter can't confirm a destructive action
 * by accident, and the confirm button can require a reason.
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  tone = "primary",
  children,
  textInput,
  onConfirm,
  onCancel,
  disabled,
}: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (textInput ? textRef.current : cancelRef.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const needsText = !!textInput && !textInput.optional;
  const canConfirm = !disabled && !busy && (!needsText || text.trim().length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm(text.trim());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-xl shadow-popover p-6 w-full max-w-sm">
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          {title}
        </h2>
        {description && <div className="text-sm text-gray-600 mt-2">{description}</div>}
        <form onSubmit={submit} className="mt-4">
          {children && <div className="mb-4">{children}</div>}
          {textInput && (
            <label className="block mb-4">
              <span className="block text-sm font-medium text-gray-700 mb-1">{textInput.label}</span>
              <textarea
                ref={textRef}
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={textInput.placeholder}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={!canConfirm} className={tone === "danger" ? btnDangerSolid : btnPrimary}>
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
