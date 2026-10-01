import { differenceInCalendarDays, format, startOfDay } from "date-fns";

/**
 * One place that decides how a due date looks, so a task reads the same on the board, in the
 * list, in the drawer and in reports.
 */
export type DueTone = "done" | "overdue" | "soon" | "normal";

/** Due dates are calendar days stored at UTC midnight; show that day, whatever the viewer's timezone. */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const day = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?Z)?$/.exec(value);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  return new Date(value);
}

/** "Sep 8", or "Sep 8, 2025" when it isn't this year. */
export function formatDate(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  return format(d, d.getFullYear() === now.getFullYear() ? "MMM d" : "MMM d, yyyy");
}

/** "Tuesday, Sep 8, 2026" — for tooltips. */
export const formatDateLong = (value: string | Date) => format(toDate(value), "EEEE, MMM d, yyyy");

export interface DueState {
  tone: DueTone;
  /** What to show, e.g. "Overdue · Sep 8", "Due tomorrow", "Sep 8". */
  label: string;
  /** Tooltip with the full date. */
  title: string;
  /** Whole days from today to the due date (negative = past). */
  days: number;
}

/** Days from today within which a task counts as "due soon". */
export const SOON_DAYS = 2;

export function getDueState(dueDate: string | Date | null | undefined, done: boolean, now: Date = new Date()): DueState | null {
  if (!dueDate) return null;
  const due = toDate(dueDate);
  const days = differenceInCalendarDays(startOfDay(due), startOfDay(now));
  const date = formatDate(due, now);
  const title = formatDateLong(due);

  if (done) return { tone: "done", label: date, title: `Was due ${title}`, days };
  if (days < 0) return { tone: "overdue", label: `Overdue · ${date}`, title: `Overdue since ${title}`, days };
  if (days <= SOON_DAYS) {
    const label = days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
    return { tone: "soon", label, title: `Due ${title}`, days };
  }
  return { tone: "normal", label: date, title: `Due ${title}`, days };
}
