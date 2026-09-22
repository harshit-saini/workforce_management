import { useEffect, useState, FormEvent } from "react";
import { api } from "@/lib/api";
import { useCenters, useDepartments, useTaskStatuses, useUsersList } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";
import { TaskPriority, TaskStatus } from "@/types";
import { btnPrimary, btnSecondary } from "@/lib/ui";

interface Props {
  onClose: () => void;
  onCreated: () => void;
  parentTaskId?: string;
  defaultRecurring?: boolean;
}

export default function TaskFormModal({ onClose, onCreated, parentTaskId, defaultRecurring }: Props) {
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const { data: users } = useUsersList();
  const { data: statuses } = useTaskStatuses();
  const selectableStatuses = statuses?.filter((s) => !s.isRecurringDefault) ?? [];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [status, setStatus] = useState<TaskStatus>("");

  useEffect(() => {
    if (!status && selectableStatuses.length > 0) {
      setStatus(selectableStatuses.find((s) => s.isDefault)?.key ?? selectableStatuses[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses]);
  const [assigneeId, setAssigneeId] = useState("");
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [isRecurring, setIsRecurring] = useState(!!defaultRecurring);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const recurringStatusKey = statuses?.find((s) => s.isRecurringDefault)?.key;
      const payload = {
        title,
        description: description || undefined,
        priority,
        status: isRecurring ? recurringStatusKey : status || undefined,
        isRecurring,
        assigneeId: assigneeId || undefined,
        centerId: centerId || undefined,
        departmentId: departmentId || undefined,
        dueDate: dueDate || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      };
      if (parentTaskId) {
        await api.post(`/tasks/${parentTaskId}/subtasks`, payload);
      } else {
        await api.post("/tasks", payload);
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create task");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-xl shadow-popover p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold mb-4">{parentTaskId ? "Add subtask" : "New task"}</h2>
        <form onSubmit={onSubmit}>
          <FormField label="Title">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Description">
            <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Priority">
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </FormField>
            <FormField label="Status">
              <select
                className={inputClass}
                value={status}
                disabled={isRecurring}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                {selectableStatuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <label className="flex items-center gap-2 my-3 text-sm text-gray-700">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            This is an ongoing / recurring responsibility (no fixed completion)
          </label>
          <FormField label="Assignee">
            <select className={inputClass} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Unassigned</option>
              {users?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Center">
              <select className={inputClass} value={centerId} onChange={(e) => setCenterId(e.target.value)}>
                <option value="">Default</option>
                {centers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Department">
              <select className={inputClass} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">—</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Due date">
              <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
            <FormField label="Estimated hours">
              <input type="number" min={0} step={0.5} className={inputClass} value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
            </FormField>
          </div>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
