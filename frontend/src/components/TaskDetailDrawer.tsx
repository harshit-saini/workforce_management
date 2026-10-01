import { useRef, useState, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { Task, TaskStatus, TaskPriority, TaskComment, TaskActivity, TaskAttachment } from "@/types";
import TaskFormModal from "@/components/TaskFormModal";
import AttachmentPreview from "@/components/AttachmentPreview";
import AttachmentViewerModal from "@/components/AttachmentViewerModal";
import PriorityBadge from "@/components/PriorityBadge";
import Avatar from "@/components/Avatar";
import { IconChevronDown, IconLink, IconPlus, IconUpload, IconX } from "@/components/icons";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { badgeColors } from "@/lib/color";
import DueDate from "@/components/DueDate";
import TagInput from "@/components/TagInput";
import { toast } from "@/lib/toast";
import { taskHref } from "@/lib/links";
import { getErrorMessage } from "@/lib/errors";
import QueryError from "@/components/QueryError";
import { useCenters, useDepartments, useIsDone, useTaskStatuses, useUsersList } from "@/hooks/useLookups";

type ActivityItem = ({ kind: "comment" } & TaskComment) | ({ kind: "activity" } & TaskActivity);

interface EditForm {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId: string;
  centerId: string;
  departmentId: string;
  dueDate: string;
  estimatedHours: string;
  tags: string[];
}

function toEditForm(task: Task): EditForm {
  return {
    title: task.title,
    description: task.description ?? "",
    priority: task.priority,
    assigneeId: task.assigneeId ?? "",
    centerId: task.centerId ?? "",
    departmentId: task.departmentId ?? "",
    dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
    estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : "",
    tags: task.tags.map((t) => t.label),
  };
}

export default function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<TaskAttachment | null>(null);
  const [comment, setComment] = useState("");
  /** Set while asking why the task is blocked, before moving it to a Blocked-category status. */
  const [pendingBlockedStatus, setPendingBlockedStatus] = useState<TaskStatus | null>(null);
  const [blockedReasonDraft, setBlockedReasonDraft] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logHours, setLogHours] = useState("8");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
  });
  const task = taskQuery.data;

  const { data: activity } = useQuery({
    queryKey: ["task-activity", taskId],
    queryFn: async () => (await api.get<ActivityItem[]>(`/tasks/${taskId}/activity`)).data,
  });

  const { data: users } = useUsersList();
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const { data: statuses } = useTaskStatuses();
  const isDone = useIsDone();

  function statusLabel(key: string): string {
    return statuses?.find((s) => s.key === key)?.label ?? key;
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    queryClient.invalidateQueries({ queryKey: ["task-activity", taskId] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }

  const addComment = useMutation({
    mutationFn: (vars: { comment: string }) => api.post(`/tasks/${taskId}/comments`, vars),
    onSuccess: () => {
      setComment("");
      invalidate();
    },
    meta: { successMessage: "Comment added", errorTitle: "Couldn't post comment" },
  });

  // Same request as dragging a card on the board, so status never needs a comment.
  type StatusVars = { status: TaskStatus; blockedReason?: string };
  const changeStatus = useMutation({
    mutationFn: (vars: StatusVars) => api.patch(`/tasks/${taskId}`, vars),
    onSuccess: () => {
      setPendingBlockedStatus(null);
      setBlockedReasonDraft("");
      invalidate();
    },
    meta: {
      successMessage: (_: unknown, v: StatusVars) => `Moved to ${statusLabel(v.status)}`,
      errorTitle: (v: StatusVars) => `Couldn't move to ${statusLabel(v.status)}`,
    },
  });

  function pickStatus(key: TaskStatus) {
    if (!task || key === task.status) return;
    if (statuses?.find((s) => s.key === key)?.category === "BLOCKED") {
      setBlockedReasonDraft("");
      setPendingBlockedStatus(key);
      return;
    }
    setPendingBlockedStatus(null);
    changeStatus.mutate({ status: key });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${taskHref(taskId)}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link", { description: "Copy it from the address bar instead." });
    }
  }

  const logTime = useMutation({
    // Hours/date are passed in (not read from state) so "Log full day" logs exactly what it says.
    mutationFn: (vars: { date: string; hoursLogged: number }) =>
      api.post<{ previousHours: number | null }>(`/tasks/${taskId}/log`, vars),
    onSuccess: invalidate,
    meta: {
      successMessage: (res: { data: { previousHours: number | null } }, vars: { date: string; hoursLogged: number }) => {
        const day = format(new Date(`${vars.date}T00:00:00`), "MMM d");
        const previous = res.data.previousHours;
        return previous != null ? `Changed ${day} from ${previous}h to ${vars.hoursLogged}h` : `Logged ${vars.hoursLogged}h on ${day}`;
      },
      errorTitle: "Couldn't log time",
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.post(`/tasks/${taskId}/attachments`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: invalidate,
    meta: {
      successMessage: (_: unknown, file: File) => `Uploaded ${file.name}`,
      errorTitle: (file: File) => `Couldn't upload ${file.name}`,
    },
  });

  const saveEdit = useMutation({
    mutationFn: (form: EditForm) =>
      api.patch(`/tasks/${taskId}`, {
        title: form.title,
        description: form.description || null,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        centerId: form.centerId || null,
        departmentId: form.departmentId || null,
        dueDate: form.dueDate || null,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        tags: form.tags,
      }),
    onSuccess: () => {
      setIsEditing(false);
      invalidate();
    },
    meta: { successMessage: "Task updated", suppressErrorToast: true },
  });

  async function onCommentSubmit(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    addComment.mutate({ comment });
  }

  function startEditing() {
    if (!task) return;
    setEditForm(toEditForm(task));
    setIsEditing(true);
  }

  function onEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (editForm) saveEdit.mutate(editForm);
  }

  if (!task) {
    // Open the drawer straight away so the click registers, then show loading or the failure.
    return (
      <div className="fixed inset-0 z-40 flex justify-end">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl p-4 sm:p-6">
          <button onClick={onClose} className="absolute top-4 right-4 text-subtle hover:text-gray-700" aria-label="Close">
            <IconX className="w-5 h-5" />
          </button>
          {taskQuery.isError ? (
            <QueryError
              className="mt-10"
              title="Couldn't load this task"
              error={taskQuery.error}
              onRetry={() => taskQuery.refetch()}
              retrying={taskQuery.isFetching}
            />
          ) : (
            <div className="text-sm text-subtle mt-1">Loading task…</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl p-4 sm:p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-subtle hover:text-gray-700" aria-label="Close">
          <IconX className="w-5 h-5" />
        </button>

        {!isEditing ? (
          <>
            <div className="flex items-start justify-between pr-8 gap-2">
              <h2 className="text-lg font-semibold text-gray-900">{task.title}</h2>
              <div className="shrink-0 flex items-center gap-3 mt-1">
                <button
                  onClick={copyLink}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 whitespace-nowrap"
                  title="Copy a link to this task"
                >
                  <IconLink className="w-3.5 h-3.5" /> Copy link
                </button>
                <button onClick={startEditing} className="text-xs text-brand-600 hover:underline whitespace-nowrap">
                  Edit
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-2">
              <StatusPicker
                value={pendingBlockedStatus ?? task.status}
                options={(statuses ?? []).filter((s) => !s.isRecurringDefault || task.isRecurring || s.key === task.status)}
                disabled={changeStatus.isPending}
                onChange={pickStatus}
              />
              <PriorityBadge priority={task.priority} showLabel />
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-100">
                <Avatar name={task.assignee?.name} size="xs" />
                {task.assignee?.name ?? "Unassigned"}
              </span>
              {task.center && <span className="px-2 py-0.5 rounded bg-gray-100">{task.center.name}</span>}
              <DueDate dueDate={task.dueDate} done={isDone(task)} full />
            </div>
            {pendingBlockedStatus && (
              <form
                className="mt-3 rounded-md border border-red-200 bg-red-50 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (blockedReasonDraft.trim()) {
                    changeStatus.mutate({ status: pendingBlockedStatus, blockedReason: blockedReasonDraft.trim() });
                  }
                }}
              >
                <label className="block text-xs font-medium text-red-800 mb-1" htmlFor="blocked-reason">
                  What's blocking this?
                </label>
                <input
                  id="blocked-reason"
                  autoFocus
                  value={blockedReasonDraft}
                  onChange={(e) => setBlockedReasonDraft(e.target.value)}
                  placeholder="e.g. Waiting on the client's sign-off"
                  className="w-full border border-red-200 rounded-md px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                />
                <div className="flex gap-2 mt-2">
                  <button type="submit" disabled={!blockedReasonDraft.trim() || changeStatus.isPending} className={btnPrimary}>
                    Move to {statusLabel(pendingBlockedStatus)}
                  </button>
                  <button type="button" onClick={() => setPendingBlockedStatus(null)} className={btnSecondary}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {!pendingBlockedStatus &&
              task.blockedReason &&
              statuses?.find((s) => s.key === task.status)?.category === "BLOCKED" && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <span className="font-medium">Blocked:</span> {task.blockedReason}
                </div>
              )}
            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {task.tags.map((t) => (
                  <span key={t.id} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {t.label}
                  </span>
                ))}
              </div>
            )}
            {task.description && <p className="text-sm text-gray-600 mt-3">{task.description}</p>}
          </>
        ) : (
          <form onSubmit={onEditSubmit} className="pr-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Edit task</h3>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 font-medium"
              value={editForm!.title}
              onChange={(e) => setEditForm({ ...editForm!, title: e.target.value })}
              required
            />
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
              rows={3}
              placeholder="Description"
              value={editForm!.description}
              onChange={(e) => setEditForm({ ...editForm!, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <label className="text-xs text-gray-500">
                Priority
                <select
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
                  value={editForm!.priority}
                  onChange={(e) => setEditForm({ ...editForm!, priority: e.target.value as TaskPriority })}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Assignee
                <select
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
                  value={editForm!.assigneeId}
                  onChange={(e) => setEditForm({ ...editForm!, assigneeId: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {users?.items.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Center
                <select
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
                  value={editForm!.centerId}
                  onChange={(e) => setEditForm({ ...editForm!, centerId: e.target.value })}
                >
                  <option value="">—</option>
                  {centers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Department
                <select
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
                  value={editForm!.departmentId}
                  onChange={(e) => setEditForm({ ...editForm!, departmentId: e.target.value })}
                >
                  <option value="">—</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-500">
                Due date
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
                  value={editForm!.dueDate}
                  onChange={(e) => setEditForm({ ...editForm!, dueDate: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-500">
                Estimated hours
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm mt-0.5"
                  value={editForm!.estimatedHours}
                  onChange={(e) => setEditForm({ ...editForm!, estimatedHours: e.target.value })}
                />
              </label>
            </div>
            <div className="mb-3">
              <span className="text-xs text-gray-500">Tags</span>
              <div className="mt-0.5">
                <TagInput value={editForm!.tags} onChange={(tags) => setEditForm({ ...editForm!, tags })} />
              </div>
            </div>
            {saveEdit.isError && (
              <p className="text-xs text-red-600 mb-2">Couldn't save changes: {getErrorMessage(saveEdit.error)}</p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={saveEdit.isPending} className={btnPrimary}>
                Save
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className={btnSecondary}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Subtasks */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Subtasks {task.subtasks && task.subtasks.length > 0 && `(${task.subtasks.filter((s) => s.status === "DONE").length}/${task.subtasks.length})`}
            </h3>
            <button onClick={() => setShowSubtaskForm(true)} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              <IconPlus className="w-3.5 h-3.5" /> Add subtask
            </button>
          </div>
          <div className="space-y-1">
            {task.subtasks?.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-md px-3 py-1.5">
                <span className={s.status === "DONE" ? "line-through text-subtle" : "text-gray-700"}>{s.title}</span>
                <span className="text-xs text-subtle">{s.status}</span>
              </div>
            ))}
            {(!task.subtasks || task.subtasks.length === 0) && <div className="text-xs text-subtle">No subtasks</div>}
          </div>
        </section>

        {/* Comment (status is changed from the picker at the top) */}
        <section className="mt-6 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Comment</h3>
          <form onSubmit={onCommentSubmit}>
            <textarea
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
              rows={3}
              placeholder="What did you do? Add a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button type="submit" disabled={!comment.trim() || addComment.isPending} className={btnPrimary}>
              {addComment.isPending ? "Posting…" : "Comment"}
            </button>
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
            <span className="text-xs text-subtle">hours</span>
            <button
              onClick={() => logTime.mutate({ date: logDate, hoursLogged: Number(logHours) })}
              disabled={logTime.isPending}
              className={btnSecondary}
            >
              Log
            </button>
            <button
              onClick={() => {
                setLogHours("8");
                logTime.mutate({ date: logDate, hoursLogged: 8 });
              }}
              disabled={logTime.isPending}
              className={btnSecondary}
            >
              Log full day (8h)
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1.5">Logging the same day again replaces that day's hours.</p>
        </section>

        {/* Attachments */}
        <section className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-700">Attachments</h3>
            <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
              <IconUpload className="w-3.5 h-3.5" /> Upload file
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
          {uploadAttachment.isPending && <div className="text-xs text-subtle mb-2">Uploading…</div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {task.attachments?.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} onClick={() => setViewingAttachment(att)} />
            ))}
          </div>
          {(!task.attachments || task.attachments.length === 0) && (
            <div className="text-xs text-subtle">No files attached</div>
          )}
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
                        <span className="text-xs text-brand-600 ml-2">→ moved to {statusLabel(item.statusChangedTo)}</span>
                      )}
                    </div>
                    <div className="text-gray-600">{item.comment}</div>
                  </>
                ) : (
                  <div className="text-gray-600">
                    <span className="font-medium text-gray-800">{item.user.name}</span> {item.message}
                  </div>
                )}
                <div className="text-[11px] text-subtle mt-0.5">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))}
            {(!activity || activity.length === 0) && <div className="text-xs text-subtle">No activity yet</div>}
          </div>
        </section>
      </div>

      {showSubtaskForm && (
        <TaskFormModal parentTaskId={taskId} onClose={() => setShowSubtaskForm(false)} onCreated={invalidate} />
      )}
      {viewingAttachment && (
        <AttachmentViewerModal attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />
      )}
    </div>
  );
}

/** The status lozenge doubles as the status control, Jira-style. */
function StatusPicker({
  value,
  options,
  disabled,
  onChange,
}: {
  value: TaskStatus;
  options: { key: string; label: string; color: string }[];
  disabled?: boolean;
  onChange: (key: TaskStatus) => void;
}) {
  const current = options.find((o) => o.key === value);
  const { background, text } = badgeColors(current?.color ?? "#6b7280");
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label="Status"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none cursor-pointer rounded pl-2 pr-6 py-0.5 text-xs font-medium border-0 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:cursor-wait"
        style={{ backgroundColor: background, color: text }}
      >
        {options.map((o) => (
          <option key={o.key} value={o.key} className="text-gray-900 bg-white">
            {o.label}
          </option>
        ))}
      </select>
      <IconChevronDown className="w-3 h-3 absolute right-1.5 pointer-events-none" style={{ color: text }} />
    </span>
  );
}
