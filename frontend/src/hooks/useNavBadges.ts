import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { OPEN_CATEGORIES } from "@/lib/links";
import { Paginated, Task, WeeklyReport } from "@/types";

export interface NavBadge {
  /** What to show: a count, or just a dot. */
  kind: "count" | "dot";
  count?: number;
  tone: "red" | "blue" | "amber";
  /** Read out by screen readers and shown as the tooltip. */
  label: string;
}

/**
 * Small signals on menu items, keyed by route path: overdue tasks on Tasks, and on Reports either
 * how many team reports wait for you or a dot while your own report is unfinished.
 */
export function useNavBadges(): Record<string, NavBadge | undefined> {
  const { user } = useAuth();
  const canReview = !!user && user.role !== "EMPLOYEE";

  const overdue = useQuery({
    // Starts with "tasks" so any task change refreshes it.
    queryKey: ["tasks", "nav-overdue", user?.id],
    queryFn: async () =>
      (
        await api.get<Paginated<Task>>("/tasks", {
          params: {
            assigneeId: user!.id,
            statusCategory: OPEN_CATEGORIES,
            dueBefore: format(addDays(new Date(), -1), "yyyy-MM-dd"),
            view: "all",
            pageSize: 1,
          },
        })
      ).data.meta.total,
    enabled: !!user,
    refetchInterval: 120_000,
  });

  // Same key as the Weekly Report page, so opening it doesn't fetch twice.
  const myReport = useQuery({
    queryKey: ["weekly-report", "self", "default"],
    queryFn: async () => (await api.get<WeeklyReport>("/reports/weekly")).data,
    enabled: !!user,
    staleTime: 60_000,
  });

  const awaiting = useQuery({
    queryKey: ["weekly-awaiting-review"],
    queryFn: async () => (await api.get<{ count: number }>("/reports/weekly/awaiting-review")).data.count,
    enabled: canReview,
    refetchInterval: 120_000,
  });

  const badges: Record<string, NavBadge | undefined> = {};
  if ((overdue.data ?? 0) > 0) {
    badges.tasks = { kind: "count", count: overdue.data, tone: "red", label: `${overdue.data} overdue ${overdue.data === 1 ? "task" : "tasks"}` };
  }
  if ((awaiting.data ?? 0) > 0) {
    badges.reports = { kind: "count", count: awaiting.data, tone: "blue", label: `${awaiting.data} team ${awaiting.data === 1 ? "report awaits" : "reports await"} your review` };
  } else if (myReport.data && (myReport.data.status === "DRAFT" || myReport.data.status === "CHANGES_REQUESTED")) {
    badges.reports = {
      kind: "dot",
      tone: "amber",
      label: myReport.data.status === "CHANGES_REQUESTED" ? "Your weekly report needs changes" : "Your weekly report isn't submitted yet",
    };
  }
  return badges;
}
