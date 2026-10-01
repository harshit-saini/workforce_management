/** Deep link that opens a task's drawer on the Tasks page. */
export function taskHref(taskId: string): string {
  return `/tasks?task=${encodeURIComponent(taskId)}`;
}

/** Link to the Tasks page with filters applied (empty values are dropped). */
export function tasksHref(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

/** Status categories that count as "still open" on the dashboard (everything but Done). */
export const OPEN_CATEGORIES = "BACKLOG,ACTIVE,BLOCKED";

/** Where clicking a notification should take you, or null if it isn't about anything specific. */
export function notificationHref(n: { type: string; relatedTaskId: string | null }): string | null {
  if (n.relatedTaskId) return taskHref(n.relatedTaskId);
  switch (n.type) {
    case "WEEKLY_REPORT_DUE":
      return "/reports/weekly";
    case "MONTHLY_REPORT_PENDING":
      return "/reports/monthly/team";
    case "NO_TIME_LOGGED":
      return "/tasks";
    case "USER_JOINED":
      return "/users";
    default:
      return null;
  }
}
