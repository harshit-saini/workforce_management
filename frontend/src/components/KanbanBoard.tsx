import { useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { Task, TaskStatus, TaskStatusOption } from "@/types";
import TaskCard, { TaskCardContent } from "@/components/TaskCard";

function Column({
  status,
  label,
  color,
  tasks,
  onOpen,
}: {
  status: TaskStatus;
  label: string;
  color: string;
  tasks: Task[];
  onOpen: (id: string) => void;
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
          <TaskCard key={t.id} task={t} onOpen={() => onOpen(t.id)} />
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveTask(null)}>
      <div className="flex gap-3 overflow-x-auto pb-2 items-start">
        {statuses.map((s) => (
          <Column
            key={s.key}
            status={s.key}
            label={s.label}
            color={s.color}
            tasks={tasks.filter((t) => t.status === s.key)}
            onOpen={onOpen}
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
