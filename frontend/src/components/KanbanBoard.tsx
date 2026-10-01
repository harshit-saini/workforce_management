import { useState } from "react";
import {
  Announcements,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardCoordinateGetter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Task, TaskStatus, TaskStatusOption } from "@/types";
import TaskCard, { TaskCardContent } from "@/components/TaskCard";

type StatusRef = { key: TaskStatus; label: string };

/** ← / → move a picked-up card to the neighbouring column (up/down do nothing; order within a column isn't kept). */
const columnCoordinates: KeyboardCoordinateGetter = (event, { context: { droppableRects, droppableContainers, collisionRect } }) => {
  const direction = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (!direction || !collisionRect) return undefined;
  event.preventDefault();
  const columns = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.left - b.left);
  const centerX = collisionRect.left + collisionRect.width / 2;
  const current = columns.findIndex((r) => centerX >= r.left && centerX <= r.left + r.width);
  const target = columns[(current === -1 ? 0 : current) + direction];
  if (!target) return undefined;
  return { x: target.left + 8, y: target.top + 44 };
};

function Column({
  status,
  label,
  color,
  tasks,
  statuses,
  onOpen,
  onMove,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  statuses: StatusRef[];
  onOpen: (id: string) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[260px] max-w-[320px] rounded-lg border-t-[3px] transition-colors duration-150 ${isOver ? "bg-brand-50" : "bg-gray-100/70"}`}
      style={{ borderTopColor: color }}
    >
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2.5 py-2.5 flex items-center justify-between sticky top-0">
        <span className="truncate">{label}</span>
        <span className="bg-gray-200 text-gray-600 rounded-full text-[11px] px-1.5 py-0.5 font-medium shrink-0 ml-2">{tasks.length}</span>
      </div>
      <div className="min-h-[40px] px-2 pb-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} statuses={statuses} onOpen={() => onOpen(t.id)} onMove={(s) => onMove(t.id, s)} />
        ))}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  statuses,
  tasks,
  onOpen,
  onStatusChange,
}: {
  statuses: TaskStatusOption[];
  tasks: Task[];
  onOpen: (id: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Hold briefly to pick up, so swiping still scrolls the board on touch screens.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Space picks up (Enter is left free to open the card).
    useSensor(KeyboardSensor, {
      coordinateGetter: columnCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    })
  );
  const statusRefs: StatusRef[] = statuses.map((s) => ({ key: s.key, label: s.label }));
  const titleOf = (id: string | number) => tasks.find((t) => t.id === id)?.title ?? "Task";
  const columnOf = (id: string | number) => statuses.find((s) => s.key === id)?.label ?? "a column";
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}. Use the left and right arrow keys to move it between columns, Space to drop it, Escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} is over ${columnOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} was dropped in ${columnOf(over.id)}.` : `${titleOf(active.id)} was dropped.`),
    onDragCancel: ({ active }) => `Move cancelled. ${titleOf(active.id)} stays where it was.`,
  };
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === active.id);
    if (task && task.status !== newStatus) {
      onStatusChange(task.id, newStatus);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Press Enter to open this task. Press Space to pick it up, then use the left and right arrow keys to move it between columns.",
        },
      }}
      onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveTask(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2 items-start">
        {statuses.map((s) => (
          <Column
            key={s.key}
            status={s.key}
            label={s.label}
            color={s.color}
            tasks={tasks.filter((t) => t.status === s.key)}
            statuses={statusRefs}
            onOpen={onOpen}
            onMove={onStatusChange}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
        {activeTask ? (
          <div className="rotate-2 w-[260px]">
            <TaskCardContent task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
