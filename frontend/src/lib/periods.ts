import { addDays, addMonths, format, startOfMonth, startOfWeek } from "date-fns";

/** Weeks run Monday–Sunday, matching the server. */
export const weekStartOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

/** "2026-09-21" ⇄ a local Date at midnight (never via UTC, which can shift the day). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const dayParam = (d: Date) => format(d, "yyyy-MM-dd");

export function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  return weekStart.getMonth() === end.getMonth()
    ? `${format(weekStart, "MMM d")} – ${format(end, "d")}`
    : `${format(weekStart, "MMM d")} – ${format(end, "MMM d")}`;
}

export const monthLabel = (year: number, month: number) => format(new Date(year, month - 1, 1), "MMMM yyyy");

export function shiftMonth(year: number, month: number, delta: number) {
  const d = addMonths(startOfMonth(new Date(year, month - 1, 1)), delta);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
