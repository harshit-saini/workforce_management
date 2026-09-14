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
      className={`flex-1 min-w-[220px] rounded-xl p-2 transition-colors duration-150 ${isOver ? "bg-brand-50" : "bg-gray-100"}`}
    >
      <div className="text-xs font-semibold text-gray-500 uppercase px-1 py-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="bg-gray-200 text-gray-600 rounded-full px-1.5">{tasks.length}</span>
      </div>
      <div className="min-h-[40px]">
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
      <div className="flex gap-3 overflow-x-auto pb-4">
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
          <div className="rotate-2 w-[220px]">
            <TaskCardContent task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
