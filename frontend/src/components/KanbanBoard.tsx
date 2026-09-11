import { DndContext, DragEndEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { Task, TaskStatus } from "@/types";
import TaskCard from "@/components/TaskCard";

const columns: { status: TaskStatus; label: string }[] = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "IN_REVIEW", label: "In review" },
  { status: "BLOCKED", label: "Blocked" },
  { status: "DONE", label: "Done" },
];

function Column({ status, label, tasks, onOpen }: { status: TaskStatus; label: string; tasks: Task[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[220px] rounded-xl p-2 ${isOver ? "bg-brand-50" : "bg-gray-100"}`}
    >
      <div className="text-xs font-semibold text-gray-500 uppercase px-1 py-1.5 flex items-center justify-between">
        <span>{label}</span>
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
  tasks,
  onOpen,
  onStatusChange,
}: {
  tasks: Task[];
  onOpen: (id: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === active.id);
    if (task && task.status !== newStatus) {
      onStatusChange(task.id, newStatus);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => (
          <Column
            key={col.status}
            status={col.status}
            label={col.label}
            tasks={tasks.filter((t) => t.status === col.status)}
            onOpen={onOpen}
          />
        ))}
      </div>
    </DndContext>
  );
}
