import { withAlpha } from "@/lib/ui";

/** Jira-style "lozenge": tinted background of the status color with the color itself as text. */
export default function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: withAlpha(color, "26"), color }}
    >
      {label}
    </span>
  );
}
