import { useEffect, useState, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Organization, StatusCategory, TaskStatusOption } from "@/types";
import { useTaskStatuses } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";

const categoryLabel: Record<StatusCategory, string> = {
  BACKLOG: "Backlog",
  ACTIVE: "Active",
  DONE: "Done",
  BLOCKED: "Blocked",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: statuses } = useTaskStatuses();
  const [showAdd, setShowAdd] = useState(false);

  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: async () => (await api.get<Organization>("/settings/organization")).data,
  });
  const [orgName, setOrgName] = useState("");
  useEffect(() => {
    if (org) setOrgName(org.name);
  }, [org]);

  const saveOrg = useMutation({
    mutationFn: () => api.patch("/settings/organization", { name: orgName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["organization"] }),
  });

  function invalidateStatuses() {
    queryClient.invalidateQueries({ queryKey: ["task-statuses"] });
  }

  const updateStatus = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Pick<TaskStatusOption, "label" | "category" | "color" | "isDefault" | "isRecurringDefault">>;
    }) => api.patch(`/settings/task-statuses/${id}`, data),
    onSuccess: invalidateStatuses,
  });

  const deleteStatus = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/task-statuses/${id}`),
    onSuccess: invalidateStatuses,
    onError: (err: any) => alert(err?.response?.data?.message ?? "Could not delete status"),
  });

  const reorder = useMutation({
    mutationFn: (order: { id: string; order: number }[]) => api.post("/settings/task-statuses/reorder", { order }),
    onSuccess: invalidateStatuses,
  });

  function moveStatus(index: number, direction: -1 | 1) {
    if (!statuses) return;
    const target = index + direction;
    if (target < 0 || target >= statuses.length) return;
    const reordered = [...statuses];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    reorder.mutate(reordered.map((s, i) => ({ id: s.id, order: i })));
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-lg font-semibold text-gray-900">Settings</h1>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Organization</h2>
        <div className="flex items-end gap-2">
          <FormField label="Organization name">
            <input className={inputClass} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </FormField>
          <button
            onClick={() => saveOrg.mutate()}
            disabled={saveOrg.isPending}
            className="mb-4 bg-brand-600 text-white text-sm px-3 py-2 rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Task statuses</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Define your own workflow columns, Jira-style. Each status maps to a category, which is what powers
              dashboards and reports (e.g. completion rate looks at the "Done" category).
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} className="text-sm text-brand-600 hover:underline shrink-0">
            + Add status
          </button>
        </div>

        <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-x-3 gap-y-1 text-xs text-gray-400 uppercase px-1 mb-1">
          <span></span>
          <span></span>
          <span>Label</span>
          <span>Category</span>
          <span>Default</span>
          <span>Ongoing</span>
          <span></span>
        </div>

        <div className="divide-y divide-gray-100">
          {statuses?.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-x-3 py-2">
              <div className="flex flex-col">
                <button
                  onClick={() => moveStatus(i, -1)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                  aria-label="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveStatus(i, 1)}
                  disabled={!statuses || i === statuses.length - 1}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20 text-xs leading-none"
                  aria-label="Move down"
                >
                  ▼
                </button>
              </div>
              <input
                type="color"
                value={s.color}
                onChange={(e) => updateStatus.mutate({ id: s.id, data: { color: e.target.value } })}
                className="w-7 h-7 rounded cursor-pointer border-0 p-0"
                title="Column color"
              />
              <input
                className="text-sm border border-transparent hover:border-gray-300 focus:border-brand-500 rounded px-1.5 py-1 outline-none"
                defaultValue={s.label}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== s.label) {
                    updateStatus.mutate({ id: s.id, data: { label: e.target.value } });
                  }
                }}
              />
              <select
                value={s.category}
                onChange={(e) => updateStatus.mutate({ id: s.id, data: { category: e.target.value as StatusCategory } })}
                className="text-xs border border-gray-300 rounded px-1.5 py-1"
              >
                {Object.entries(categoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="radio"
                name="default-status"
                checked={s.isDefault}
                onChange={() => updateStatus.mutate({ id: s.id, data: { isDefault: true } })}
                title="New tasks start here"
              />
              <input
                type="radio"
                name="recurring-default-status"
                checked={s.isRecurringDefault}
                onChange={() => updateStatus.mutate({ id: s.id, data: { isRecurringDefault: true } })}
                title="Used for ongoing/recurring tasks"
              />
              <button
                onClick={() => {
                  if (confirm(`Delete status "${s.label}"?`)) deleteStatus.mutate(s.id);
                }}
                className="text-xs text-red-600 hover:underline justify-self-end"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </section>

      {showAdd && <AddStatusModal onClose={() => setShowAdd(false)} onCreated={invalidateStatuses} />}
    </div>
  );
}

function AddStatusModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<StatusCategory>("ACTIVE");
  const [color, setColor] = useState("#3b82f6");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/settings/task-statuses", { label, category, color });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create status");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold mb-4">Add status</h2>
        <form onSubmit={onSubmit}>
          <FormField label="Label">
            <input className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} required />
          </FormField>
          <FormField label="Category">
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as StatusCategory)}>
              {Object.entries(categoryLabel).map(([value, l]) => (
                <option key={value} value={value}>
                  {l}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Color">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-16 border border-gray-300 rounded cursor-pointer"
            />
          </FormField>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
