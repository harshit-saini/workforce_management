import { useRef, useState, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { Task, TaskStatus, TaskComment, TaskActivity } from "@/types";
import TaskFormModal from "@/components/TaskFormModal";

type ActivityItem = ({ kind: "comment" } & TaskComment) | ({ kind: "activity" } & TaskActivity);

const statusOptions: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "ONGOING", "IN_REVIEW", "BLOCKED", "DONE"];

export default function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [comment, setComment] = useState("");
  const [statusChangedTo, setStatusChangedTo] = useState<TaskStatus | "">("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logHours, setLogHours] = useState("8");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: task } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
  });

  const { data: activity } = useQuery({
    queryKey: ["task-activity", taskId],
    queryFn: async () => (await api.get<ActivityItem[]>(`/tasks/${taskId}/activity`)).data,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    queryClient.invalidateQueries({ queryKey: ["task-activity", taskId] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  const addComment = useMutation({
    mutationFn: () =>
      api.post(`/tasks/${taskId}/comments`, {
        comment,
        statusChangedTo: statusChangedTo || undefined,
      }),
    onSuccess: () => {
      setComment("");
      setStatusChangedTo("");
      invalidate();
    },
  });

  const logTime = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/log`, { date: logDate, hoursLogged: Number(logHours) }),
    onSuccess: invalidate,
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/tasks/${taskId}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: invalidate,
  });

  async function onCommentSubmit(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    addComment.mutate();
  }

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          ✕
        </button>

        <h2 className="text-lg font-semibold text-gray-900 pr-8">{task.title}</h2>
        <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-2">
          <span className="px-2 py-0.5 rounded-full bg-gray-100">{task.status}</span>
          <span className="px-2 py-0.5 rounded-full bg-gray-100">{task.priority}</span>
          {task.assignee && <span className="px-2 py-0.5 rounded-full bg-gray-100">{task.assignee.name}</span>}
          {task.center && <span className="px-2 py-0.5 rounded-full bg-gray-100">{task.center.name}</span>}
        </div>
        {task.description && <p className="text-sm text-gray-600 mt-3">{task.description}</p>}

        {/* Subtasks */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Subtasks {task.subtasks && task.subtasks.length > 0 && `(${task.subtasks.filter((s) => s.status === "DONE").length}/${task.subtasks.length})`}
            </h3>
            <button onClick={() => setShowSubtaskForm(true)} className="text-xs text-brand-600 hover:underline">
              + Add subtask
            </button>
          </div>
          <div className="space-y-1">
            {task.subtasks?.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-md px-3 py-1.5">
                <span className={s.status === "DONE" ? "line-through text-gray-400" : "text-gray-700"}>{s.title}</span>
                <span className="text-xs text-gray-400">{s.status}</span>
              </div>
            ))}
            {(!task.subtasks || task.subtasks.length === 0) && <div className="text-xs text-gray-400">No subtasks</div>}
          </div>
        </section>

        {/* Update: comment + status */}
        <section className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Update task</h3>
          <form onSubmit={onCommentSubmit}>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
              rows={3}
              placeholder="What did you do? Add a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <select
                value={statusChangedTo}
                onChange={(e) => setStatusChangedTo(e.target.value as TaskStatus)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              >
                <option value="">Keep status ({task.status})</option>
                {statusOptions
                  .filter((s) => s !== task.status)
                  .map((s) => (
                    <option key={s} value={s}>
                      Move to {s}
                    </option>
                  ))}
              </select>
              <button
                type="submit"
                disabled={addComment.isPending}
                className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-brand-700 disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </form>
        </section>

        {/* Time log */}
        <section className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Log time</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
            <input
              type="number"
              min={0.25}
              max={24}
              step={0.25}
              value={logHours}
              onChange={(e) => setLogHours(e.target.value)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-20"
            />
            <span className="text-xs text-gray-400">hours</span>
            <button
              onClick={() => logTime.mutate()}
              disabled={logTime.isPending}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
            >
              Log
            </button>
            <button
              onClick={() => {
                setLogHours("8");
                logTime.mutate();
              }}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50"
            >
              Log full day (8h)
            </button>
          </div>
        </section>

        {/* Attachments */}
        <section className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Attachments</h3>
            <button onClick={() => fileInputRef.current?.click()} className="text-xs text-brand-600 hover:underline">
              + Upload file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAttachment.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
        </section>

        {/* Activity */}
        <section className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Activity</h3>
          <div className="space-y-3">
            {activity?.map((item) => (
              <div key={item.id} className="text-sm border-l-2 border-gray-100 pl-3">
                {item.kind === "comment" ? (
                  <>
                    <div className="text-gray-800">
                      <span className="font-medium">{item.user.name}</span>
                      {item.statusChangedTo && (
                        <span className="text-xs text-brand-600 ml-2">→ moved to {item.statusChangedTo}</span>
                      )}
                    </div>
                    <div className="text-gray-600">{item.comment}</div>
                  </>
                ) : (
                  <div className="text-gray-600">
                    <span className="font-medium text-gray-800">{item.user.name}</span> {item.message}
                  </div>
                )}
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))}
            {(!activity || activity.length === 0) && <div className="text-xs text-gray-400">No activity yet</div>}
          </div>
        </section>
      </div>

      {showSubtaskForm && (
        <TaskFormModal parentTaskId={taskId} onClose={() => setShowSubtaskForm(false)} onCreated={invalidate} />
      )}
    </div>
  );
}
