import { format } from "date-fns";
import { Task } from "@/types";
import { useTaskStatuses } from "@/hooks/useLookups";

export default function TaskListTable({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { data: statuses } = useTaskStatuses();

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Title</th>
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-left px-4 py-2">Priority</th>
            <th className="text-left px-4 py-2">Assignee</th>
            <th className="text-left px-4 py-2">Center</th>
            <th className="text-left px-4 py-2">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const statusOption = statuses?.find((s) => s.key === t.status);
            return (
              <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(t.id)}>
                <td className="px-4 py-2 font-medium text-gray-800">{t.title}</td>
                <td className="px-4 py-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs text-white"
                    style={{ backgroundColor: statusOption?.color ?? "#6b7280" }}
                  >
                    {statusOption?.label ?? t.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500">{t.priority}</td>
                <td className="px-4 py-2 text-gray-500">{t.assignee?.name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{t.center?.name ?? "—"}</td>
                <td className="px-4 py-2 text-gray-500">{t.dueDate ? format(new Date(t.dueDate), "MMM d, yyyy") : "—"}</td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                No tasks found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
