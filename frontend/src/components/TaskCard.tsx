import { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import clsx from "clsx";
import { Task, TaskStatus } from "@/types";
import ActionMenu from "@/components/ActionMenu";
import Avatar from "@/components/Avatar";
import PriorityBadge from "@/components/PriorityBadge";
import DueDate from "@/components/DueDate";
import { useIsDone } from "@/hooks/useLookups";

/** Pure visual card, no drag hooks — used both by the real draggable card and the DragOverlay preview. */
export function TaskCardContent({ task, actions }: { task: Task; actions?: ReactNode }) {
  const isDone = useIsDone();
  const subtasksDone = task.subtasks?.filter((s) => s.status === "DONE").length ?? 0;
  const subtasksTotal = task.subtasks?.length ?? 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-card p-3 mb-2 hover:border-brand-300 hover:shadow-md transition-shadow duration-150">
      {/* Shown when subtasks are on the board, so a card never loses its context. */}
      {task.parentTask && (
        <div className="text-[11px] text-subtle truncate mb-1" title={`Subtask of ${task.parentTask.title}`}>
          ↳ {task.parentTask.title}
        </div>
      )}
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="text-sm font-medium text-gray-800 line-clamp-2">{task.title}</div>
        {actions}
      </div>

      {task.tags.length > 0 && (
        <div className="flex items-center flex-wrap gap-1 mb-2">
          {task.tags.map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
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
          <div className="text-[10px] text-subtle mt-0.5">
            {subtasksDone}/{subtasksTotal} subtasks
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Only the levels that need attention; Medium/Low are the norm and just add noise. */}
          {(task.priority === "HIGH" || task.priority === "URGENT") && <PriorityBadge priority={task.priority} />}
          <DueDate dueDate={task.dueDate} done={isDone(task)} />
        </div>
        <Avatar name={task.assignee?.name} size="xs" />
      </div>
    </div>
  );
}

/**
 * A draggable card. Everything the mouse can do has a keyboard equivalent: Tab to it, Enter
 * opens it, Space picks it up (then ← → to change column, Space to drop, Esc to cancel), and the
 * "⋯" menu moves it to any column without dragging at all (also the easiest way on touch screens).
 */
export default function TaskCard({
  task,
  statuses,
  onOpen,
  onMove,
}: {
  task: Task;
  statuses: { key: TaskStatus; label: string }[];
  onOpen: () => void;
  onMove: (status: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  // The "⋯" button must not start a drag or count as a click on the card.
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const actions = (
    <span onClick={stop} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onKeyDown={stop} className="shrink-0 -mt-1 -mr-1.5">
      <ActionMenu
        label={`Actions for ${task.title}`}
        items={statuses
          .filter((s) => s.key !== task.status)
          .map((s) => ({ label: `Move to ${s.label}`, onSelect: () => onMove(s.key) }))}
      />
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Not role="button": it contains a button (the menu), and nesting those confuses screen readers.
      role="group"
      aria-label={task.title}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
      }}
      className={clsx(
        "cursor-pointer rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
        isDragging && "opacity-40"
      )}
    >
      <TaskCardContent task={task} actions={actions} />
    </div>
  );
}
