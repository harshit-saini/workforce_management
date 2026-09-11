import { useState, FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDepartments } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";

export default function DepartmentsPage() {
  const { data: departments } = useDepartments();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/departments", { name });
      setName("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create department");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Departments</h1>

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <FormField label="New department">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </FormField>
        <button type="submit" className="bg-brand-600 text-white text-sm px-3 py-2 rounded-md hover:bg-brand-700 mb-4">
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {departments?.map((d) => (
          <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div className="font-medium text-gray-800">{d.name}</div>
            <div className="text-xs text-gray-400">{d._count?.members ?? 0} members</div>
          </div>
        ))}
        {departments?.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">No departments yet</div>}
      </div>
    </div>
  );
}
