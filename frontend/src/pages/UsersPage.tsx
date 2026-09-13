import { useState, FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Role } from "@/types";
import { useUsersList, useCenters, useDepartments } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";

const roles: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE"];

export default function UsersPage() {
  const [showInvite, setShowInvite] = useState(false);
  const { data, refetch } = useUsersList();
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const queryClient = useQueryClient();

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/users/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const updateFields = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/users/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Users</h1>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-brand-700"
        >
          Invite user
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Center</th>
              <th className="text-left px-4 py-2">Department</th>
              <th className="text-left px-4 py-2">Manager</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-800">{u.name}</div>
                  <div className="text-xs text-gray-400">{u.email}</div>
                </td>
                <td className="px-4 py-2">
                  {u.role === "OWNER" ? (
                    "OWNER"
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => updateRole.mutate({ id: u.id, role: e.target.value as Role })}
                      className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.centerId ?? ""}
                    onChange={(e) => updateFields.mutate({ id: u.id, data: { centerId: e.target.value || null } })}
                    className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                  >
                    <option value="">—</option>
                    {centers?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.departmentId ?? ""}
                    onChange={(e) => updateFields.mutate({ id: u.id, data: { departmentId: e.target.value || null } })}
                    className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                  >
                    <option value="">—</option>
                    {departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.managerId ?? ""}
                    onChange={(e) => updateFields.mutate({ id: u.id, data: { managerId: e.target.value || null } })}
                    className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                  >
                    <option value="">—</option>
                    {data?.items
                      .filter((m) => m.id !== u.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  {u.role === "OWNER" ? (
                    "ACTIVE"
                  ) : (
                    <select
                      value={u.status}
                      onChange={(e) => updateStatus.mutate({ id: u.id, status: e.target.value })}
                      className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                      <option value="ON_LEAVE">On leave</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-2">
                  {u.role !== "OWNER" && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${u.name}?`)) {
                          api.delete(`/users/${u.id}`).then(() => refetch());
                        }
                      }}
                      className="text-red-600 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/users/invite", {
        email,
        role,
        centerId: centerId || undefined,
        departmentId: departmentId || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to send invite");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold mb-4">Invite user</h2>
        <form onSubmit={onSubmit}>
          <FormField label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormField>
          <FormField label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </FormField>
          <FormField label="Center">
            <select className={inputClass} value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">—</option>
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
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300">
              Cancel
            </button>
            <button type="submit" className="px-3 py-1.5 text-sm rounded-md bg-brand-600 text-white hover:bg-brand-700">
              Send invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
