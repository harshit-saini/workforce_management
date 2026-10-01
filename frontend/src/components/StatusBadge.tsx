import { badgeColors } from "@/lib/color";

/** Jira-style "lozenge": a tint of the status color with same-hue text darkened to stay readable (WCAG AA). */
export default function StatusBadge({ label, color }: { label: string; color: string }) {
  const { background, text } = badgeColors(color);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: background, color: text }}
    >
      {label}
    </span>
  );
}
