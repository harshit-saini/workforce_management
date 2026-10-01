import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { downloadFromApi } from "@/lib/download";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api";
import { Paginated, Task, TaskStatus } from "@/types";
import { useCenters, useDepartments, useTaskStatuses, useUsersList } from "@/hooks/useLookups";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import KanbanBoard from "@/components/KanbanBoard";
import TaskListTable from "@/components/TaskListTable";
import TaskFormModal from "@/components/TaskFormModal";
import TaskDetailDrawer from "@/components/TaskDetailDrawer";
import QueryError, { LoadingText } from "@/components/QueryError";
import { IconBoard, IconDownload, IconPlus, IconSearch, IconUpload, IconX } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { btnPrimary, btnSecondary, filterControl, quickChip } from "@/lib/ui";
import { addDays, endOfWeek, format } from "date-fns";
import { OPEN_CATEGORIES } from "@/lib/links";

type Tab = "board" | "list" | "ongoing";
const TABS: Tab[] = ["board", "list", "ongoing"];

const CATEGORY_LABELS: Record<string, string> = { BACKLOG: "Backlog", ACTIVE: "Active", DONE: "Done", BLOCKED: "Blocked" };

function categoryFilterLabel(value: string) {
  if (value === OPEN_CATEGORIES) return "Not done";
  return value
    .split(",")
    .map((c) => CATEGORY_LABELS[c] ?? c)
    .join(", ");
}

/**
 * The view, filters and open task all live in the URL, so a refresh keeps them, links
 * from elsewhere (notifications, dashboard tiles, reports) land on the right task, and
 * Back closes the drawer instead of leaving the page.
 */
export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const tab: Tab = TABS.includes(params.get("view") as Tab) ? (params.get("view") as Tab) : "board";
  const assigneeId = params.get("assignee") ?? "";
  const centerId = params.get("center") ?? "";
  const departmentId = params.get("department") ?? "";
  const statusCategory = params.get("category") ?? "";
  const due = params.get("due") ?? ""; // "overdue" | "week"
  const highPriority = params.get("priority") === "high";
  const showSubtasks = params.get("subtasks") === "1";
  const openTaskId = params.get("task");

  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const search = useDebouncedValue(searchInput);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** Filter changes replace the current history entry so Back isn't cluttered with them. */
  function updateParams(changes: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true, state: location.state }
    );
  }

  useEffect(() => {
    // Links from the setup checklist land here with the new-task form already open.
    if (params.get("new") === "1") {
      setShowCreate(true);
      updateParams({ new: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if ((params.get("q") ?? "") !== search) updateParams({ q: search || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openTask(id: string) {
    // Opening a task is a real navigation (push), so Back closes it again.
    const next = new URLSearchParams(params);
    next.set("task", id);
    setParams(next, { state: { drawer: true } });
  }

  function closeTask() {
    if ((location.state as { drawer?: boolean } | null)?.drawer) navigate(-1);
    else updateParams({ task: null });
  }
  const { user } = useAuth();
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const { data: users } = useUsersList();
  const { data: statuses } = useTaskStatuses();
  const boardStatuses = statuses?.filter((s) => !s.isRecurringDefault) ?? [];
  const queryClient = useQueryClient();

  // "Overdue" and "Due this week" only make sense for work that isn't finished.
  const today = new Date();
  const dueRange =
    due === "overdue"
      ? { dueBefore: format(addDays(today, -1), "yyyy-MM-dd") }
      : due === "week"
        ? { dueAfter: format(today, "yyyy-MM-dd"), dueBefore: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd") }
        : {};
  const filters = {
    assigneeId: assigneeId || undefined,
    centerId: centerId || undefined,
    departmentId: departmentId || undefined,
    search: search || undefined,
    statusCategory: statusCategory || (due ? OPEN_CATEGORIES : undefined),
    priority: highPriority ? "HIGH,URGENT" : undefined,
    ...dueRange,
    // Subtasks sit under their parent card unless asked for; a subtask whose parent isn't in view still shows.
    collapseSubtasks: showSubtasks ? undefined : "true",
    view: tab === "ongoing" ? "ongoing" : tab === "board" ? "board" : "all",
    pageSize: "200",
  };

  const tasksQuery = useQuery({
    queryKey: ["tasks", filters],
    queryFn: async () => (await api.get<Paginated<Task>>("/tasks", { params: filters })).data,
    // Keep the current board on screen while a new filter/tab loads instead of blanking it.
    placeholderData: keepPreviousData,
  });
  const { data } = tasksQuery;

  const tasksQueryKey = ["tasks", filters];

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.patch(`/tasks/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: tasksQueryKey });
      const previous = queryClient.getQueryData<Paginated<Task>>(tasksQueryKey);
      if (previous) {
        queryClient.setQueryData<Paginated<Task>>(tasksQueryKey, {
          ...previous,
          items: previous.items.map((t) => (t.id === id ? { ...t, status } : t)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(tasksQueryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    meta: {
      errorTitle: ({ id }: { id: string }) => {
        const title = data?.items.find((t) => t.id === id)?.title;
        return title ? `Couldn't move "${title}"` : "Couldn't move task";
      },
    },
  });

  function refetchTasks() {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  async function exportTasks() {
    setExporting(true);
    try {
      const { pageSize: _pageSize, ...exportFilters } = filters;
      await downloadFromApi("/tasks/export", `tasks-${new Date().toISOString().slice(0, 10)}.xlsx`, exportFilters);
      toast.success("Export downloaded");
    } catch (err) {
      toast.error("Export failed", { description: getErrorMessage(err) });
    } finally {
      setExporting(false);
    }
  }

  const tasks = data?.items ?? [];

  // "Show subtasks" is a view option, not a filter, so it isn't counted or cleared.
  const activeFilterCount = [searchInput, assigneeId, centerId, departmentId, statusCategory, due, highPriority].filter(Boolean).length;
  function clearFilters() {
    setSearchInput("");
    updateParams({ q: null, assignee: null, center: null, department: null, category: null, due: null, priority: null });
  }

  // Nothing at all here yet (as opposed to nothing matching): the page should invite the first task
  // instead of showing filters and empty columns for a workspace with nothing to filter.
  const hasNoTasks = !!data && data.meta.total === 0 && activeFilterCount === 0;
  const hasNoMatches = !!data && data.meta.total === 0 && activeFilterCount > 0;
  const showCenters = !!centers && centers.length > 0;
  const showDepartments = !!departments && departments.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tasks</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mt-2">
            {(["board", "list", "ongoing"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => updateParams({ view: t === "board" ? null : t })}
                className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                  tab === t ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <Link to="/tasks/import" className={btnSecondary}>
                <IconUpload className="w-4 h-4" /> Import
              </Link>
              <button
                onClick={exportTasks}
                disabled={exporting || hasNoTasks}
                className={btnSecondary}
                title={hasNoTasks ? "Nothing to export yet" : "Download the tasks matching the current filters as an Excel file"}
              >
                <IconDownload className="w-4 h-4" /> {exporting ? "Exporting…" : "Export"}
              </button>
            </>
          )}
          <button onClick={() => setShowCreate(true)} className={btnPrimary}>
            <IconPlus className="w-4 h-4" /> New task
          </button>
        </div>
      </div>

      {!hasNoTasks && (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <IconSearch className="w-4 h-4 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              placeholder="Search…"
              aria-label="Search tasks"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={`${filterControl(!!searchInput)} pl-8 w-48`}
            />
          </div>
          <span className="hidden sm:block h-5 w-px bg-gray-200" aria-hidden="true" />
          {user?.role !== "EMPLOYEE" && user && (
            <button
              aria-pressed={assigneeId === user.id}
              onClick={() => updateParams({ assignee: assigneeId === user.id ? null : user.id })}
              className={quickChip(assigneeId === user.id)}
            >
              Assigned to me
            </button>
          )}
          <button aria-pressed={due === "overdue"} onClick={() => updateParams({ due: due === "overdue" ? null : "overdue" })} className={quickChip(due === "overdue")}>
            Overdue
          </button>
          <button aria-pressed={due === "week"} onClick={() => updateParams({ due: due === "week" ? null : "week" })} className={quickChip(due === "week")}>
            Due this week
          </button>
          <button
            aria-pressed={statusCategory === "BLOCKED"}
            onClick={() => updateParams({ category: statusCategory === "BLOCKED" ? null : "BLOCKED" })}
            className={quickChip(statusCategory === "BLOCKED")}
          >
            Blocked
          </button>
          <button aria-pressed={highPriority} onClick={() => updateParams({ priority: highPriority ? null : "high" })} className={quickChip(highPriority)}>
            High+
          </button>
          <button aria-pressed={showSubtasks} onClick={() => updateParams({ subtasks: showSubtasks ? null : "1" })} className={quickChip(showSubtasks)}>
            Show subtasks
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Assignee" value={assigneeId} onChange={(e) => updateParams({ assignee: e.target.value || null })} className={filterControl(!!assigneeId)}>
            <option value="">All assignees</option>
            {users?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {(showCenters || centerId) && (
          <select aria-label="Center" value={centerId} onChange={(e) => updateParams({ center: e.target.value || null })} className={filterControl(!!centerId)}>
            <option value="">All centers</option>
            {centers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          )}
          {(showDepartments || departmentId) && (
          <select aria-label="Department" value={departmentId} onChange={(e) => updateParams({ department: e.target.value || null })} className={filterControl(!!departmentId)}>
            <option value="">All departments</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          )}
          {statusCategory && statusCategory !== "BLOCKED" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-brand-500 bg-brand-50 pl-2.5 pr-1 py-1 text-sm text-brand-800">
              Status: {categoryFilterLabel(statusCategory)}
              <button onClick={() => updateParams({ category: null })} className="rounded p-0.5 hover:bg-brand-100" aria-label="Clear status filter">
                <IconX className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-x-3 text-sm text-gray-600" aria-live="polite">
            <span>
              Showing {data.items.length} of {data.meta.total} {data.meta.total === 1 ? "task" : "tasks"}
            </span>
            {data.meta.total > data.items.length && (
              <span className="text-amber-700">Only the first {data.items.length} are shown. Narrow the filters to see the rest.</span>
            )}
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-brand-700 font-medium hover:underline">
                Clear filters ({activeFilterCount})
              </button>
            )}
          </div>
        )}
      </div>
      )}

      {tasksQuery.isError && !data ? (
        <QueryError
          title="Couldn't load tasks"
          error={tasksQuery.error}
          onRetry={() => tasksQuery.refetch()}
          retrying={tasksQuery.isFetching}
        />
      ) : !data ? (
        <LoadingText />
      ) : null}

      {hasNoTasks && (
        <EmptyState
          icon={<IconBoard />}
          title={tab === "ongoing" ? "No ongoing tasks yet" : "Create your first task"}
          description={
            tab === "ongoing"
              ? "Ongoing tasks are recurring responsibilities with no fixed finish line, like on-call duty or a weekly review."
              : isAdmin
                ? "Tasks are the work you assign and track. Add them one at a time, or bring a whole backlog in from Excel."
                : "Tasks are the work you assign and track. Add your first one to get started."
          }
          primary={{ label: tab === "ongoing" ? "New ongoing task" : "New task", onClick: () => setShowCreate(true) }}
          secondary={isAdmin && tab !== "ongoing" ? { label: "Import from Excel", to: "/tasks/import" } : undefined}
        />
      )}
      {hasNoMatches && (
        <EmptyState
          icon={<IconSearch />}
          title="No tasks match these filters"
          description="Try removing a filter, or searching for something else."
          primary={{ label: `Clear filters (${activeFilterCount})`, onClick: clearFilters }}
        />
      )}

      {data && !hasNoTasks && !hasNoMatches && tab === "board" && (
        <KanbanBoard
          statuses={boardStatuses}
          tasks={tasks}
          onOpen={openTask}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
        />
      )}
      {data && !hasNoTasks && !hasNoMatches && (tab === "list" || tab === "ongoing") && <TaskListTable tasks={tasks} onOpen={openTask} />}

      {showCreate && <TaskFormModal
          onClose={() => setShowCreate(false)}
          onCreated={refetchTasks}
          onOpenCreated={openTask}
          defaultRecurring={tab === "ongoing"}
        />}
      {openTaskId && <TaskDetailDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} />}
    </div>
  );
}
