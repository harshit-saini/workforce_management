import { useDraggable } from "@dnd-kit/core";
import clsx from "clsx";
import { Task } from "@/types";
import { format, isPast, isToday } from "date-fns";
import Avatar from "@/components/Avatar";
import PriorityBadge from "@/components/PriorityBadge";
import { IconCalendar } from "@/components/icons";

/** Pure visual card, no drag hooks — used both by the real draggable card and the DragOverlay preview. */
export function TaskCardContent({ task }: { task: Task }) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const overdue = dueDate && isPast(dueDate) && !isToday(dueDate);
  const subtasksDone = task.subtasks?.filter((s) => s.status === "DONE").length ?? 0;
  const subtasksTotal = task.subtasks?.length ?? 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-card p-3 mb-2 hover:border-brand-300 hover:shadow-md transition-shadow duration-150">
      <div className="text-sm font-medium text-gray-800 mb-2 line-clamp-2">{task.title}</div>

      {task.tags.length > 0 && (
        <div className="flex items-center flex-wrap gap-1 mb-2">
          {task.tags.map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              {t.label}
            </span>
          ))}
        </div>
      )}

      {subtasksTotal > 0 && (
        <div className="mb-2">
          <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full"
              style={{ width: `${(subtasksDone / subtasksTotal) * 100}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {subtasksDone}/{subtasksTotal} subtasks
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PriorityBadge priority={task.priority} />
          {dueDate && (
            <span className={clsx("inline-flex items-center gap-1 text-xs", overdue ? "text-red-600 font-medium" : "text-gray-400")}>
              <IconCalendar className="w-3.5 h-3.5" />
              {format(dueDate, "MMM d")}
            </span>
          )}
        </div>
        <Avatar name={task.assignee?.name} size="xs" />
      </div>
    </div>
  );
}

export default function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={clsx("cursor-pointer", isDragging && "opacity-40")}
    >
      <TaskCardContent task={task} />
    </div>
  );
}
