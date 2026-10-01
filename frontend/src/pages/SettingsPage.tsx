import { useEffect, useState, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { Organization, StatusCategory, TaskStatusOption } from "@/types";
import { useTaskStatuses } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";
import { IconPlus, IconChevronUp, IconChevronDown } from "@/components/icons";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";
import QueryError, { LoadingText } from "@/components/QueryError";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusBadge from "@/components/StatusBadge";
import { badgeColors, contrastRatio, hexToRgb } from "@/lib/color";

const categoryLabel: Record<StatusCategory, string> = {
  BACKLOG: "Backlog",
  ACTIVE: "Active",
  DONE: "Done",
  BLOCKED: "Blocked",
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const statusesQuery = useTaskStatuses();
  const statuses = statusesQuery.data;
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<TaskStatusOption | null>(null);

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
    meta: { successMessage: "Organization name saved", errorTitle: "Couldn't save the organization name" },
  });

  function statusName(id: string) {
    return statuses?.find((s) => s.id === id)?.label ?? "status";
  }

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
    // Re-sync so the controls go back to the saved value; the toast says why.
    onError: invalidateStatuses,
    meta: {
      successMessage: (_: unknown, v: { id: string; data: { label?: string } }) =>
        `Saved "${v.data.label ?? statusName(v.id)}"`,
      errorTitle: (v: { id: string }) => `Couldn't update "${statusName(v.id)}"`,
    },
  });

  const deleteStatus = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/task-statuses/${id}`),
    onSuccess: invalidateStatuses,
    meta: {
      successMessage: (_: unknown, id: string) => `Deleted "${statusName(id)}"`,
      errorTitle: (id: string) => `Couldn't delete "${statusName(id)}"`,
    },
  });

  const reorder = useMutation({
    mutationFn: (order: { id: string; order: number }[]) => api.post("/settings/task-statuses/reorder", { order }),
    onSuccess: invalidateStatuses,
    meta: { errorTitle: "Couldn't reorder statuses" },
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

      <section className={`${card} p-4`}>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Organization</h2>
        <div className="flex items-end gap-2">
          <FormField label="Organization name">
            <input className={inputClass} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </FormField>
          <button onClick={() => saveOrg.mutate()} disabled={saveOrg.isPending} className={`mb-4 ${btnPrimary}`}>
            Save
          </button>
        </div>
      </section>

      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Task statuses</h2>
            <p className="text-xs text-subtle mt-0.5">
              Define your own workflow columns, Jira-style. Each status maps to a category, which is what powers
              dashboards and reports (e.g. completion rate looks at the "Done" category).
            </p>
          </div>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline shrink-0">
            <IconPlus className="w-4 h-4" /> Add status
          </button>
        </div>

        <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-x-3 gap-y-1 text-xs text-subtle uppercase px-1 mb-1">
          <span></span>
          <span></span>
          <span>Label</span>
          <span>Category</span>
          <span>Default</span>
          <span>Ongoing</span>
          <span></span>
        </div>

        {!statuses &&
          (statusesQuery.isError ? (
            <QueryError
              title="Couldn't load task statuses"
              error={statusesQuery.error}
              onRetry={() => statusesQuery.refetch()}
              retrying={statusesQuery.isFetching}
            />
          ) : (
            <LoadingText />
          ))}

        <div className="divide-y divide-gray-100">
          {statuses?.map((s, i) => (
            <div key={s.id} className="grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] items-center gap-x-3 py-2">
              <div className="flex flex-col">
                <button
                  onClick={() => moveStatus(i, -1)}
                  disabled={i === 0}
                  className="text-subtle hover:text-gray-700 disabled:opacity-20 leading-none"
                  aria-label="Move up"
                >
                  <IconChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveStatus(i, 1)}
                  disabled={!statuses || i === statuses.length - 1}
                  className="text-subtle hover:text-gray-700 disabled:opacity-20 leading-none"
                  aria-label="Move down"
                >
                  <IconChevronDown className="w-3.5 h-3.5" />
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
              {s.isDefault || s.isRecurringDefault ? (
                // Wrapped in a span because disabled buttons don't show tooltips.
                <span
                  className="justify-self-end shrink-0"
                  title={
                    s.isDefault
                      ? "New tasks start here. Make another status the default before deleting this one."
                      : "Used for ongoing tasks. Make another status the ongoing default before deleting this one."
                  }
                >
                  <button disabled className="text-xs text-red-600 opacity-40 cursor-not-allowed">
                    Delete
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setDeleting(s)}
                  className="text-xs text-red-600 hover:underline justify-self-end shrink-0"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {deleting && (
        <ConfirmDialog
          title={`Delete the "${deleting.label}" status?`}
          description={
            <p>
              This can't be undone. If any tasks still use it, it won't be deleted. Move them to another status first.
            </p>
          }
          confirmLabel="Delete status"
          tone="danger"
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteStatus.mutateAsync(deleting.id).catch(() => {});
            setDeleting(null);
          }}
        />
      )}

      {showAdd && <AddStatusModal onClose={() => setShowAdd(false)} onCreated={invalidateStatuses} />}
    </div>
  );
}

/** Why a picked color might not work well, in plain words — or null if it's fine. */
function colorWarning(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  if (contrastRatio(rgb, [255, 255, 255]) < 1.5) return "This color is almost white, so the column's top border will be hard to see.";
  if (badgeColors(hex).adjusted) return "This color is light, so the badge text is darkened to stay readable.";
  return null;
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
      toast.success(`Status "${label}" added`);
      onCreated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create status"));
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
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 border border-gray-300 rounded cursor-pointer"
              />
              <StatusBadge label={label.trim() || "Preview"} color={color} />
            </div>
            {colorWarning(color) && <p className="text-xs text-amber-700 mt-1.5">{colorWarning(color)}</p>}
          </FormField>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
