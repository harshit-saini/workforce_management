import { useDraggable } from "@dnd-kit/core";
import clsx from "clsx";
import { Task } from "@/types";
import { format } from "date-fns";

const priorityColor: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export default function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined}
      className={clsx(
        "bg-white rounded-lg border border-gray-100 shadow-sm p-3 mb-2 cursor-pointer hover:border-brand-300",
        isDragging && "opacity-50"
      )}
    >
      <div className="text-sm font-medium text-gray-800 mb-1">{task.title}</div>
      <div className="flex items-center flex-wrap gap-1.5 mb-1">
        <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-medium", priorityColor[task.priority])}>
          {task.priority}
        </span>
        {task.tags.map((t) => (
          <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {t.label}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{task.assignee?.name ?? "Unassigned"}</span>
        {task.dueDate && <span>{format(new Date(task.dueDate), "MMM d")}</span>}
      </div>
      {task.subtasks && task.subtasks.length > 0 && (
        <div className="text-[11px] text-gray-400 mt-1">
          {task.subtasks.filter((s) => s.status === "DONE").length}/{task.subtasks.length} subtasks
        </div>
      )}
    </div>
  );
}
