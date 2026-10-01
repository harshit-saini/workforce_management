import { ReactNode, useEffect, useId, useRef, useState, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { Paginated, Task, TaskStatus, TaskPriority, TaskComment, TaskActivity, TaskAttachment } from "@/types";
import AttachmentPreview from "@/components/AttachmentPreview";
import AttachmentViewerModal from "@/components/AttachmentViewerModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import Avatar from "@/components/Avatar";
import { IconChevronDown, IconLink, IconUpload } from "@/components/icons";
import Dialog from "@/components/Dialog";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { badgeColors } from "@/lib/color";
import DueDate from "@/components/DueDate";
import TagInput from "@/components/TagInput";
import InlineText, { fieldClass } from "@/components/InlineText";
import { toast } from "@/lib/toast";
import { taskHref } from "@/lib/links";
import QueryError from "@/components/QueryError";
import { useCenters, useDepartments, useIsDone, useTaskStatuses, useUsersList } from "@/hooks/useLookups";

type ActivityItem = ({ kind: "comment" } & TaskComment) | ({ kind: "activity" } & TaskActivity);

/** One field saved on its own: what to send, and what to show straight away while it travels. */
type FieldSave = { label: string; body: Record<string, unknown>; optimistic: Partial<Task> };

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export default function TaskDetailDrawer({
  taskId,
  onClose,
  onOpenTask,
}: {
  taskId: string;
  onClose: () => void;
  /** Jump to another task (a subtask or the parent) without closing the panel. */
  onOpenTask?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [viewingAttachment, setViewingAttachment] = useState<TaskAttachment | null>(null);
  const [comment, setComment] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  /** Set while asking why the task is blocked, before moving it to a Blocked-category status. */
  const [pendingBlockedStatus, setPendingBlockedStatus] = useState<TaskStatus | null>(null);
  const [blockedReasonDraft, setBlockedReasonDraft] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logHours, setLogHours] = useState("8");
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
    // The list the person just clicked from already has this task, so show it while the full copy loads.
    placeholderData: () => {
      for (const [, data] of queryClient.getQueriesData<Paginated<Task>>({ queryKey: ["tasks"] })) {
        const hit = data?.items?.find((t) => t.id === taskId);
        if (hit) return hit;
      }
      return undefined;
    },
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

  // Anything typed but not yet sent. Fields that save when you leave them never count.
  const hasDraft = !!comment.trim() || !!newSubtask.trim() || (!!pendingBlockedStatus && !!blockedReasonDraft.trim());
  function requestClose() {
    if (hasDraft) setConfirmingClose(true);
    else onClose();
  }
  function draftSummary(): string {
    const parts = [];
    if (comment.trim()) parts.push("a comment");
    if (newSubtask.trim()) parts.push("a subtask");
    if (pendingBlockedStatus && blockedReasonDraft.trim()) parts.push("a blocked reason");
    return parts.join(" and ");
  }

  /** Each detail saves the moment it changes, shows the new value straight away, and rolls back if it fails. */
  const saveField = useMutation({
    mutationFn: (v: FieldSave) => api.patch(`/tasks/${taskId}`, v.body),
    onMutate: async (v) => {
      setSaveState("saving");
      const previous = queryClient.getQueryData<Task>(["task", taskId]);
      if (previous) queryClient.setQueryData<Task>(["task", taskId], { ...previous, ...v.optimistic });
      await queryClient.cancelQueries({ queryKey: ["task", taskId] });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      setSaveState("idle");
      if (ctx?.previous) queryClient.setQueryData(["task", taskId], ctx.previous);
    },
    onSuccess: () => setSaveState("saved"),
    onSettled: invalidate,
    meta: { errorTitle: (v: FieldSave) => `Couldn't update the ${v.label}` },
  });

  useEffect(() => {
    if (saveState !== "saved") return;
    const t = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

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

  const addSubtask = useMutation({
    // Starts out like its parent, so a subtask lands with the same person, center and department.
    mutationFn: (title: string) =>
      api.post(`/tasks`, {
        title,
        parentTaskId: taskId,
        assigneeId: task?.assigneeId || undefined,
        centerId: task?.centerId || undefined,
        departmentId: task?.departmentId || undefined,
      }),
    onSuccess: () => {
      setNewSubtask("");
      invalidate();
    },
    meta: { errorTitle: "Couldn't add the subtask" },
  });

  const toggleSubtask = useMutation({
    mutationFn: (vars: { id: string; title: string; done: boolean }) =>
      api.patch(`/tasks/${vars.id}`, { status: subtaskStatusKey(vars.done) }),
    // Tick or untick shows straight away; a failure puts it back.
    onMutate: async (vars) => {
      // Write first, then cancel: awaiting before the write lets the controlled checkbox snap back for a frame.
      const previous = queryClient.getQueryData<Task>(["task", taskId]);
      if (previous) {
        const status = subtaskStatusKey(vars.done);
        queryClient.setQueryData<Task>(["task", taskId], {
          ...previous,
          subtasks: previous.subtasks?.map((s) => (s.id === vars.id && status ? { ...s, status } : s)),
        });
      }
      await queryClient.cancelQueries({ queryKey: ["task", taskId] });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["task", taskId], ctx.previous);
    },
    onSettled: invalidate,
    meta: { errorTitle: (v: { title: string }) => `Couldn't update "${v.title}"` },
  });

  /** Ticking sends a subtask to the first Done status; unticking sends it back to the default one. */
  function subtaskStatusKey(done: boolean): string | undefined {
    if (done) return [...(statuses ?? [])].sort((a, b) => a.order - b.order).find((s) => s.category === "DONE")?.key;
    return statuses?.find((s) => s.isDefault)?.key;
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

  function onCommentSubmit(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    addComment.mutate({ comment });
  }

  function onSubtaskSubmit(e: FormEvent) {
    e.preventDefault();
    const title = newSubtask.trim();
    if (title && !addSubtask.isPending) addSubtask.mutate(title);
  }

  const shell = (children: ReactNode, withActions = true) => (
    <>
      <Dialog
        variant="sheet"
        label="Task details"
        title="Task"
        onClose={requestClose}
        headerActions={
          withActions && (
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 whitespace-nowrap"
              title="Copy a link to this task"
            >
              <IconLink className="w-3.5 h-3.5" /> Copy link
            </button>
          )
        }
      >
        {children}
      </Dialog>
      {confirmingClose && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          description={`You've typed ${draftSummary() || "something"} that hasn't been saved. Closing now throws it away.`}
          confirmLabel="Discard"
          tone="danger"
          onConfirm={onClose}
          onCancel={() => setConfirmingClose(false)}
        />
      )}
    </>
  );

  if (!task) {
    // Open the drawer straight away so the click registers, then show loading or the failure.
    return shell(
      taskQuery.isError ? (
        <QueryError
          className="mt-10"
          title="Couldn't load this task"
          error={taskQuery.error}
          onRetry={() => taskQuery.refetch()}
          retrying={taskQuery.isFetching}
        />
      ) : (
        <div aria-busy="true" className="animate-pulse">
          <div className="h-6 w-2/3 rounded bg-gray-100 mt-1" />
          <div className="h-5 w-24 rounded bg-gray-100 mt-4" />
          <div className="h-16 rounded bg-gray-100 mt-6" />
          <div className="space-y-2 mt-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-6 rounded bg-gray-100" />
            ))}
          </div>
          <div className="text-sm text-subtle mt-4">Loading task…</div>
        </div>
      ),
      false
    );
  }

  const blocked = statuses?.find((s) => s.key === task.status)?.category === "BLOCKED";
  const subtasks = task.subtasks ?? [];
  const doneSubtasks = subtasks.filter((s) => isDone({ status: s.status })).length;
  const logged = task.loggedHours ?? 0;
  const overEstimate = task.estimatedHours != null && logged > task.estimatedHours;

  function save(label: string, body: Record<string, unknown>, optimistic: Partial<Task>) {
    saveField.mutate({ label, body, optimistic });
  }

  return shell(
    <>
      {task.parentTask && (
        <div className="mb-1 text-xs text-gray-600">
          Parent:{" "}
          <button
            onClick={() => onOpenTask?.(task.parentTask!.id)}
            className="text-brand-700 hover:underline font-medium"
            title="Open the parent task"
          >
            {task.parentTask.title}
          </button>
        </div>
      )}
      <h2 className="sr-only">{task.title}</h2>
      <div className="flex items-start justify-between gap-2">
        <InlineText
          value={task.title}
          ariaLabel="Title"
          required
          maxLength={200}
          className="!text-lg font-semibold -ml-2 flex-1 min-w-0"
          onCommit={(title) => save("title", { title }, { title })}
        />
      </div>
      <div className="flex items-center gap-3 mt-2">
        <StatusPicker
          value={pendingBlockedStatus ?? task.status}
          options={(statuses ?? []).filter((s) => !s.isRecurringDefault || task.isRecurring || s.key === task.status)}
          disabled={changeStatus.isPending}
          onChange={pickStatus}
        />
        <span role="status" className="text-xs text-subtle min-h-4">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
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
      {!pendingBlockedStatus && blocked && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="group" aria-label="Blocked">
          <label htmlFor={fid("blocked")} className="block text-xs font-semibold uppercase tracking-wide text-red-800">
            Blocked
          </label>
          <InlineText
            id={fid("blocked")}
            value={task.blockedReason ?? ""}
            ariaLabel="Blocked reason"
            placeholder="Add why it's blocked"
            required
            className="-ml-2 mt-0.5 !text-red-900 placeholder:text-red-700"
            onCommit={(blockedReason) => save("blocked reason", { blockedReason }, { blockedReason })}
          />
        </div>
      )}

      <div className="mt-4">
        <InlineText
          multiline
          value={task.description ?? ""}
          ariaLabel="Description"
          placeholder="Add a description…"
          className="-ml-2 text-gray-700"
          onCommit={(description) => save("description", { description: description || null }, { description: description || null })}
        />
      </div>

      {/* Details: every value saves as soon as it changes. */}
      <section className="mt-5" aria-label="Details">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Details</h3>
        <dl className="-mx-2">
          <DetailRow label="Priority" htmlFor={fid("priority")}>
            <select
              id={fid("priority")}
              className={fieldClass}
              value={task.priority}
              onChange={(e) => {
                const priority = e.target.value as TaskPriority;
                save("priority", { priority }, { priority });
              }}
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </DetailRow>
          <DetailRow label="Assignee" htmlFor={fid("assignee")}>
            <div className="flex items-center gap-1">
              <Avatar name={task.assignee?.name} size="xs" />
              <select
                id={fid("assignee")}
                className={fieldClass}
                value={task.assigneeId ?? ""}
                onChange={(e) => {
                  const assigneeId = e.target.value || null;
                  const u = users?.items.find((x) => x.id === assigneeId);
                  save(
                    "assignee",
                    { assigneeId },
                    { assigneeId, assignee: u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null } : null }
                  );
                }}
              >
                <option value="">Unassigned</option>
                {users?.items.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </DetailRow>
          <DetailRow label="Center" htmlFor={fid("center")}>
            <select
              id={fid("center")}
              className={fieldClass}
              value={task.centerId ?? ""}
              onChange={(e) => {
                const centerId = e.target.value || null;
                const c = centers?.find((x) => x.id === centerId);
                save("center", { centerId }, { centerId, center: c ? { id: c.id, name: c.name, code: c.code } : null });
              }}
            >
              <option value="">None</option>
              {centers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </DetailRow>
          <DetailRow label="Department" htmlFor={fid("department")}>
            <select
              id={fid("department")}
              className={fieldClass}
              value={task.departmentId ?? ""}
              onChange={(e) => {
                const departmentId = e.target.value || null;
                const d = departments?.find((x) => x.id === departmentId);
                save("department", { departmentId }, { departmentId, department: d ? { id: d.id, name: d.name } : null });
              }}
            >
              <option value="">None</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </DetailRow>
          <DetailRow label="Due date" htmlFor={fid("due")}>
            <div className="flex items-center gap-2">
              <input
                id={fid("due")}
                type="date"
                className={`${fieldClass} !w-auto`}
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) => {
                  const v = e.target.value;
                  save("due date", { dueDate: v || null }, { dueDate: v ? `${v}T00:00:00.000Z` : null });
                }}
              />
              <DueDate dueDate={task.dueDate} done={isDone(task)} full />
            </div>
          </DetailRow>
          <DetailRow label="Estimate" htmlFor={fid("estimate")}>
            <div className="flex items-center gap-2">
              <InlineText
                id={fid("estimate")}
                type="number"
                value={task.estimatedHours != null ? String(task.estimatedHours) : ""}
                ariaLabel="Estimated hours"
                placeholder="—"
                className="!w-20"
                onCommit={(v) => {
                  const estimatedHours = v === "" ? null : Math.max(0, Number(v));
                  save("estimate", { estimatedHours }, { estimatedHours });
                }}
              />
              <span className="text-xs text-gray-600">
                hours
                {task.loggedHours != null && (
                  <>
                    {" · "}
                    <span className={overEstimate ? "text-red-700 font-medium" : undefined}>
                      {logged}h logged{task.estimatedHours != null && ` of ${task.estimatedHours}h`}
                    </span>
                  </>
                )}
              </span>
            </div>
          </DetailRow>
          <DetailRow label="Tags" htmlFor={fid("tags")}>
            <div className="px-2">
              <TagInput
                id={fid("tags")}
                value={task.tags.map((t) => t.label)}
                onChange={(tags) => save("tags", { tags }, { tags: tags.map((label) => ({ id: label, label })) as Task["tags"] })}
              />
            </div>
          </DetailRow>
          <DetailRow label="Reporter">
            <div className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-700">
              <Avatar name={task.createdBy?.name} size="xs" />
              {task.createdBy?.name ?? "—"}
              <span className="text-xs text-subtle">· created {format(new Date(task.createdAt), "MMM d, yyyy")}</span>
            </div>
          </DetailRow>
        </dl>
      </section>

      {/* Subtasks */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Subtasks {subtasks.length > 0 && `(${doneSubtasks}/${subtasks.length})`}
          </h3>
        </div>
        {subtasks.length > 0 && (
          <ul className="space-y-1 mb-2">
            {subtasks.map((s) => {
              const done = isDone({ status: s.status });
              return (
                <li key={s.id} className="flex items-center gap-2 text-sm border border-gray-100 rounded-md px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => toggleSubtask.mutate({ id: s.id, title: s.title, done: e.target.checked })}
                    aria-label={`Mark "${s.title}" ${done ? "not done" : "done"}`}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => onOpenTask?.(s.id)}
                    className={`flex-1 min-w-0 text-left truncate hover:underline ${done ? "line-through text-subtle" : "text-gray-800"}`}
                    title="Open subtask"
                  >
                    {s.title}
                  </button>
                  <span className="text-xs text-gray-600 shrink-0">{statusLabel(s.status)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={onSubtaskSubmit}>
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            aria-label="New subtask"
            placeholder="Add a subtask and press Enter"
            maxLength={200}
            disabled={addSubtask.isPending}
            className="w-full border border-dashed border-gray-300 rounded-md px-3 py-1.5 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-60"
          />
        </form>
        {subtasks.length === 0 && <p className="text-xs text-subtle mt-1">It starts with the same assignee, center and department.</p>}
      </section>

      {/* Time log */}
      <section className="mt-6 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Log time</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} aria-label="Date" className="border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          <input
            type="number"
            min={0.25}
            max={24}
            step={0.25}
            value={logHours}
            onChange={(e) => setLogHours(e.target.value)}
            aria-label="Hours"
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

      {/* Comment box sits right above the feed it adds to (status is changed from the picker at the top). */}
      <section className="mt-6 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Activity</h3>
        <form onSubmit={onCommentSubmit} className="mb-4">
          <textarea
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
            rows={3}
            aria-label="Comment"
            placeholder="What did you do? Add a comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button type="submit" disabled={!comment.trim() || addComment.isPending} className={btnPrimary}>
            {addComment.isPending ? "Posting…" : "Comment"}
          </button>
        </form>
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

      {viewingAttachment && (
        <AttachmentViewerModal attachment={viewingAttachment} onClose={() => setViewingAttachment(null)} />
      )}
    </>
  );
}

function DetailRow({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[7.5rem_1fr] items-center gap-2 px-2 py-0.5">
      <dt className="text-xs font-medium text-gray-600">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}</dt>
      <dd className="min-w-0">{children}</dd>
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
