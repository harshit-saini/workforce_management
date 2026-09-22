import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Paginated, Task, TaskStatus } from "@/types";
import { useCenters, useDepartments, useTaskStatuses, useUsersList } from "@/hooks/useLookups";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import KanbanBoard from "@/components/KanbanBoard";
import TaskListTable from "@/components/TaskListTable";
import TaskFormModal from "@/components/TaskFormModal";
import TaskDetailDrawer from "@/components/TaskDetailDrawer";
import { IconPlus, IconSearch } from "@/components/icons";
import { btnPrimary } from "@/lib/ui";

type Tab = "board" | "list" | "ongoing";

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>("board");
  const [assigneeId, setAssigneeId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput);
  const [showCreate, setShowCreate] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const { data: users } = useUsersList();
  const { data: statuses } = useTaskStatuses();
  const boardStatuses = statuses?.filter((s) => !s.isRecurringDefault) ?? [];
  const queryClient = useQueryClient();

  const filters = {
    assigneeId: assigneeId || undefined,
    centerId: centerId || undefined,
    departmentId: departmentId || undefined,
    search: search || undefined,
    view: tab === "ongoing" ? "ongoing" : tab === "board" ? "board" : "all",
    pageSize: "200",
  };

  const { data } = useQuery({
    queryKey: ["tasks", filters],
    queryFn: async () => (await api.get<Paginated<Task>>("/tasks", { params: filters })).data,
  });

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
  });

  function refetchTasks() {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  const tasks = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Tasks</h1>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mt-2">
            {(["board", "list", "ongoing"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm rounded-md capitalize transition-colors ${
                  tab === t ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}>
          <IconPlus className="w-4 h-4" /> New task
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <IconSearch className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="border border-gray-300 rounded-md pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">All assignees</option>
          {users?.items.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">All centers</option>
          {centers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">All departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {tab === "board" && (
        <KanbanBoard
          statuses={boardStatuses}
          tasks={tasks}
          onOpen={setOpenTaskId}
          onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
        />
      )}
      {(tab === "list" || tab === "ongoing") && <TaskListTable tasks={tasks} onOpen={setOpenTaskId} />}

      {showCreate && <TaskFormModal onClose={() => setShowCreate(false)} onCreated={refetchTasks} defaultRecurring={tab === "ongoing"} />}
      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
