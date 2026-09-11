import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Paginated, Task, TaskStatus } from "@/types";
import { useCenters, useDepartments, useUsersList } from "@/hooks/useLookups";
import KanbanBoard from "@/components/KanbanBoard";
import TaskListTable from "@/components/TaskListTable";
import TaskFormModal from "@/components/TaskFormModal";
import TaskDetailDrawer from "@/components/TaskDetailDrawer";

type Tab = "board" | "list" | "ongoing";

export default function TasksPage() {
  const [tab, setTab] = useState<Tab>("board");
  const [assigneeId, setAssigneeId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const { data: users } = useUsersList();
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

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.patch(`/tasks/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function refetchTasks() {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  const tasks = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["board", "list", "ongoing"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-sm rounded-md capitalize ${
                tab === t ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-brand-700">
          + New task
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-48"
        />
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
        <KanbanBoard tasks={tasks} onOpen={setOpenTaskId} onStatusChange={(id, status) => updateStatus.mutate({ id, status })} />
      )}
      {(tab === "list" || tab === "ongoing") && <TaskListTable tasks={tasks} onOpen={setOpenTaskId} />}

      {showCreate && <TaskFormModal onClose={() => setShowCreate(false)} onCreated={refetchTasks} defaultRecurring={tab === "ongoing"} />}
      {openTaskId && <TaskDetailDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
    </div>
  );
}
