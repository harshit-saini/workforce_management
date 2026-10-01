import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Paginated, Task } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useTaskStatuses } from "@/hooks/useLookups";
import { OPEN_CATEGORIES, taskHref, tasksHref } from "@/lib/links";
import DueDate from "@/components/DueDate";
import PriorityBadge from "@/components/PriorityBadge";
import StatusBadge from "@/components/StatusBadge";
import QueryError from "@/components/QueryError";
import { card } from "@/lib/ui";

const SHOWN = 6;

/** The first thing on the dashboard for everyone: your own unfinished work, soonest due first. */
export default function AssignedToYou() {
  const { user } = useAuth();
  const { data: statuses } = useTaskStatuses();
  const query = useQuery({
    queryKey: ["tasks", "assigned-to-me", user?.id],
    queryFn: async () =>
      (
        await api.get<Paginated<Task>>("/tasks", {
          params: { assigneeId: user!.id, statusCategory: OPEN_CATEGORIES, collapseSubtasks: "true", view: "all", pageSize: 50 },
        })
      ).data,
    enabled: !!user,
  });
  const tasks = [...(query.data?.items ?? [])].sort((a, b) => {
    // Dated work first (earliest, so overdue leads), then undated.
    if (!a.dueDate !== !b.dueDate) return a.dueDate ? -1 : 1;
    return (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  });
  const total = query.data?.meta.total ?? 0;
  const status = (key: string) => statuses?.find((s) => s.key === key);

  return (
    <section className={`${card} overflow-hidden`} aria-label="Assigned to you">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">
          Assigned to you {query.data && <span className="font-normal text-gray-600">· {total} open</span>}
        </h2>
        {total > SHOWN && (
          <Link
            to={tasksHref({ view: "list", assignee: user?.id, category: OPEN_CATEGORIES })}
            className="text-sm text-brand-700 hover:underline"
          >
            View all {total}
          </Link>
        )}
      </div>
      {query.isError && !query.data && (
        <div className="p-4">
          <QueryError title="Couldn't load your tasks" error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
        </div>
      )}
      {query.isPending && <div className="px-4 py-4 text-sm text-subtle">Loading…</div>}
      {query.data && tasks.length === 0 && (
        <div className="px-4 py-5 text-sm text-gray-700">Nothing is assigned to you right now. New work will show up here.</div>
      )}
      {tasks.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {tasks.slice(0, SHOWN).map((t) => {
            const s = status(t.status);
            return (
              <li key={t.id}>
                <Link
                  to={taskHref(t.id)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
                >
                  <PriorityBadge priority={t.priority} />
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-900">{t.title}</span>
                  {s && <StatusBadge label={s.label} color={s.color} />}
                  <span className="shrink-0 text-xs w-28 text-right">
                    <DueDate dueDate={t.dueDate} done={false} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
