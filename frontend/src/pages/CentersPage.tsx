import { useState, FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useCenters } from "@/hooks/useLookups";
import { patchCached, useInstantEdit } from "@/hooks/useInstantEdit";
import { Center } from "@/types";
import FormField, { inputClass } from "@/components/FormField";
import StatCard from "@/components/StatCard";
import QueryError, { LoadingText } from "@/components/QueryError";
import EmptyState from "@/components/EmptyState";
import { IconBuilding } from "@/components/icons";
import Dialog from "@/components/Dialog";

export default function CentersPage({ embedded = false }: { embedded?: boolean }) {
  const centersQuery = useCenters();
  const centers = centersQuery.data;
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const toggleActive = useInstantEdit<{ id: string; isActive: boolean }>({
    keys: [["centers"]],
    request: ({ id, isActive }) => api.patch(`/centers/${id}`, { isActive }),
    optimistic: (qc, v) => patchCached<Center>(qc, ["centers"], v.id, (c) => ({ ...c, isActive: v.isActive })),
    inverse: (_qc, v) => ({ id: v.id, isActive: !v.isActive }),
    successMessage: (v) => `${centerName(v.id)} ${v.isActive ? "activated" : "deactivated"}`,
    errorTitle: (v) => `Couldn't update ${centerName(v.id)}`,
  });

  function centerName(id: string) {
    return centers?.find((c) => c.id === id)?.name ?? "Center";
  }

  const dashboardQuery = useQuery({
    queryKey: ["center-dashboard", selected],
    queryFn: async () => (await api.get(`/centers/${selected}/dashboard`, { params: { preset: "this_week" } })).data,
    enabled: !!selected,
    placeholderData: keepPreviousData,
  });
  const dashboard = dashboardQuery.data;

  return (
    <div className="space-y-4">
      <div className={`flex items-center ${embedded ? "justify-end" : "justify-between"}`}>
        {!embedded && <h1 className="text-lg font-semibold text-gray-900">Centers</h1>}
        <button onClick={() => setShowCreate(true)} className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-brand-700">
          Add center
        </button>
      </div>

      {!centers &&
        (centersQuery.isError ? (
          <QueryError
            title="Couldn't load centers"
            error={centersQuery.error}
            onRetry={() => centersQuery.refetch()}
            retrying={centersQuery.isFetching}
          />
        ) : (
          <LoadingText />
        ))}

      {centers?.length === 0 && (
        <EmptyState
          icon={<IconBuilding />}
          title="No centers yet"
          description="Centers are your offices or sites. Add one to place people and tasks at a location and see numbers for each site."
          primary={{ label: "Add center", onClick: () => setShowCreate(true) }}
        />
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {centers?.map((c) => (
          <div
            key={c.id}
            className={`relative bg-white rounded-xl border shadow-sm hover:border-brand-400 ${
              selected === c.id ? "border-brand-500" : "border-gray-100"
            }`}
          >
            <button onClick={() => setSelected(c.id)} className="block w-full text-left p-4 pr-28 rounded-xl">
              <div className="font-medium text-gray-900">{c.name}</div>
              <div className="text-xs text-subtle">
                {c.code} · {c.timezone}
              </div>
            </button>
            <button
              onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })}
              title={c.isActive ? "Active. Click to deactivate" : "Inactive. Click to activate"}
              className={`absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full font-medium ${
                c.isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {c.isActive ? "Active" : "Inactive"}
            </button>
          </div>
        ))}
      </div>

      {selected && !dashboard && dashboardQuery.isError && (
        <QueryError
          title="Couldn't load this center's dashboard"
          error={dashboardQuery.error}
          onRetry={() => dashboardQuery.refetch()}
          retrying={dashboardQuery.isFetching}
        />
      )}

      {selected && dashboard && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">Center dashboard (this week)</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Headcount" value={dashboard.headcount} />
            <StatCard label="Tasks created" value={dashboard.tasksCreated} />
            <StatCard label="Tasks completed" value={dashboard.tasksCompleted} />
            <StatCard label="Open" value={dashboard.tasksOpen} />
            <StatCard label="Blocked" value={dashboard.tasksBlocked} />
          </div>
        </div>
      )}

      {showCreate && <CreateCenterModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateCenterModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/centers", { name, code, address: address || undefined, timezone });
      queryClient.invalidateQueries({ queryKey: ["centers"] });
      toast.success(`Center "${name}" created`);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create center"));
    }
  }

  return (
    <Dialog label={"Add center"} size="sm" onClose={onClose} closeOnOutside={!(name || code || address)}>
      <div className="p-6">
        <h2 className="text-base font-semibold mb-4">Add center</h2>
        <form onSubmit={onSubmit}>
          <FormField label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Code">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
          </FormField>
          <FormField label="Address">
            <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
          </FormField>
          <FormField label="Timezone">
            <input className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </FormField>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300">
              Cancel
            </button>
            <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700">
              Create
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
