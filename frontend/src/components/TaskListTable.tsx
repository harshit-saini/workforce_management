import { format, isPast, isToday } from "date-fns";
import clsx from "clsx";
import { Task } from "@/types";
import { useTaskStatuses } from "@/hooks/useLookups";
import StatusBadge from "@/components/StatusBadge";
import PriorityBadge from "@/components/PriorityBadge";
import Avatar from "@/components/Avatar";

export default function TaskListTable({ tasks, onOpen }: { tasks: Task[]; onOpen: (id: string) => void }) {
  const { data: statuses } = useTaskStatuses();

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Title</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
            <th className="text-left px-4 py-2.5 font-medium">Priority</th>
            <th className="text-left px-4 py-2.5 font-medium">Assignee</th>
            <th className="text-left px-4 py-2.5 font-medium">Center</th>
            <th className="text-left px-4 py-2.5 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const statusOption = statuses?.find((s) => s.key === t.status);
            const dueDate = t.dueDate ? new Date(t.dueDate) : null;
            const overdue = dueDate && isPast(dueDate) && !isToday(dueDate);
            return (
              <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(t.id)}>
                <td className="px-4 py-2.5 font-medium text-gray-800">{t.title}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge label={statusOption?.label ?? t.status} color={statusOption?.color ?? "#6b7280"} />
                </td>
                <td className="px-4 py-2.5">
                  <PriorityBadge priority={t.priority} showLabel />
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  <div className="flex items-center gap-2">
                    <Avatar name={t.assignee?.name} size="xs" />
                    {t.assignee?.name ?? "Unassigned"}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{t.center?.name ?? "—"}</td>
                <td className={clsx("px-4 py-2.5", overdue ? "text-red-600 font-medium" : "text-gray-500")}>
                  {dueDate ? format(dueDate, "MMM d, yyyy") : "—"}
                </td>
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
