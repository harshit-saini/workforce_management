import { KeyboardEvent, useState } from "react";
import { IconX } from "@/components/icons";

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 50;

/** Labels to attach to a task: type and press Enter or comma to add; Backspace removes the last one. */
export default function TagInput({ value, onChange, id }: { value: string[]; onChange: (tags: string[]) => void; id?: string }) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const label = raw.trim().slice(0, MAX_TAG_LENGTH);
    setDraft("");
    if (!label || value.length >= MAX_TAGS) return;
    if (value.some((t) => t.toLowerCase() === label.toLowerCase())) return;
    onChange([...value, label]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      // Enter must not submit the surrounding form while someone is typing a tag.
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border border-gray-300 rounded-md px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-0.5 rounded bg-gray-100 text-gray-700 text-xs pl-1.5 pr-0.5 py-0.5">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded p-0.5 text-subtle hover:bg-gray-200 hover:text-gray-800"
            aria-label={`Remove tag ${tag}`}
          >
            <IconX className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        maxLength={MAX_TAG_LENGTH}
        disabled={value.length >= MAX_TAGS}
        placeholder={value.length ? "" : "Add a tag, press Enter"}
        aria-label="Add a tag"
        className="flex-1 min-w-24 text-sm outline-none bg-transparent"
      />
    </div>
  );
}
