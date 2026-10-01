import clsx from "clsx";
import { getDueState, DueTone } from "@/lib/dueState";
import { IconAlertCircle, IconCalendar, IconCheck, IconClock } from "@/components/icons";

const TONE: Record<DueTone, { icon: typeof IconCalendar; className: string }> = {
  // Finished work: calm and neutral, with a check instead of an alarm.
  done: { icon: IconCheck, className: "text-subtle" },
  // Red is reserved for what is genuinely late — and it also carries an icon and the word "Overdue".
  overdue: { icon: IconAlertCircle, className: "bg-red-50 text-red-700 font-medium px-1.5 py-0.5 rounded" },
  soon: { icon: IconClock, className: "bg-amber-50 text-amber-800 font-medium px-1.5 py-0.5 rounded" },
  normal: { icon: IconCalendar, className: "text-subtle" },
};

/**
 * A task's due date, the same way everywhere (board, list, drawer): late tasks get a red
 * "Overdue" badge, tasks due within two days an amber one, finished tasks a calm check mark.
 * `full` spells it out for the drawer ("Due Sep 8" instead of "Sep 8").
 */
export default function DueDate({
  dueDate,
  done,
  full = false,
  className,
}: {
  dueDate: string | null | undefined;
  done: boolean;
  full?: boolean;
  className?: string;
}) {
  const state = getDueState(dueDate, done);
  if (!state) return null;
  const { icon: Icon, className: toneClass } = TONE[state.tone];
  const prefix = full && state.tone === "normal" ? "Due " : full && state.tone === "done" ? "Was due " : "";
  return (
    <span title={state.title} className={clsx("inline-flex items-center gap-1 text-xs whitespace-nowrap", toneClass, className)}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {prefix}
      {state.label}
    </span>
  );
}
