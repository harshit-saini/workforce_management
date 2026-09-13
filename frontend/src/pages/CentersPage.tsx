import { useState, FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCenters } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";
import StatCard from "@/components/StatCard";

export default function CentersPage() {
  const { data: centers } = useCenters();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/centers/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["centers"] }),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["center-dashboard", selected],
    queryFn: async () => (await api.get(`/centers/${selected}/dashboard`, { params: { preset: "this_week" } })).data,
    enabled: !!selected,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Centers</h1>
        <button onClick={() => setShowCreate(true)} className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-brand-700">
          Add center
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {centers?.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`text-left bg-white rounded-xl border shadow-sm p-4 hover:border-brand-400 ${
              selected === c.id ? "border-brand-500" : "border-gray-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-400">
                  {c.code} · {c.timezone}
                </div>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleActive.mutate({ id: c.id, isActive: !c.isActive });
                }}
                className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
              >
                {c.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </button>
        ))}
      </div>

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
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create center");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
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
    </div>
  );
}
