import { useEffect, useRef, useState } from "react";

/** Looks like plain text until hovered or focused, so the panel reads as a page, not a form. */
export const fieldClass =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 hover:border-gray-300 hover:bg-gray-50 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";

/**
 * Text that edits where it stands: saves when you leave it or press Enter, Escape puts the old text back.
 * An empty value is refused when `required`, so a title can never be blanked by accident.
 */
export default function InlineText({
  value,
  onCommit,
  ariaLabel,
  placeholder,
  className = "",
  required,
  multiline,
  type = "text",
  maxLength,
  id,
}: {
  value: string;
  onCommit: (next: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "number";
  maxLength?: number;
  id?: string;
}) {
  const [draft, setDraft] = useState(value);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // Follows the saved value (including a rollback after a failed save) whenever it changes underneath.
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft, multiline]);

  function commit() {
    const next = draft.trim();
    if (next === value.trim()) return setDraft(value);
    if (required && !next) return setDraft(value);
    onCommit(next);
  }

  const common = {
    id,
    "aria-label": ariaLabel,
    placeholder,
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    maxLength,
    className: `${fieldClass} ${className}`,
  };

  if (multiline) {
    return (
      <textarea
        {...common}
        ref={areaRef}
        rows={2}
        className={`${common.className} resize-none overflow-hidden`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            // Undoing an edit shouldn't also close the panel it's in; with nothing to undo, Escape closes as usual.
            if (draft !== value) e.stopPropagation();
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
    );
  }
  return (
    <input
      {...common}
      type={type}
      {...(type === "number" ? { min: 0, step: 0.5 } : {})}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          if (draft !== value) e.stopPropagation();
          setDraft(value);
          // Let the reverted text land before the blur compares it with the saved value.
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

