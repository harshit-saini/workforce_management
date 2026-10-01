import { useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { Invite, InviteDelivery, Role, User } from "@/types";
import { copyText } from "@/lib/clipboard";
import { useAuth } from "@/context/AuthContext";
import { useUsersList, useCenters, useDepartments } from "@/hooks/useLookups";
import FormField, { inputClass } from "@/components/FormField";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import ActionMenu from "@/components/ActionMenu";
import QueryError, { LoadingText } from "@/components/QueryError";
import { IconPlus } from "@/components/icons";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";

const roles: Role[] = ["ADMIN", "MANAGER", "EMPLOYEE"];

const roleLabel: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };
const statusLabel: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", ON_LEAVE: "On leave" };
const fieldLabel: Record<string, string> = { centerId: "center", departmentId: "department", managerId: "manager" };

/** What each role can do, shown when confirming a change so nobody grants access by accident. */
const roleSummary: Record<Role, string> = {
  OWNER: "",
  ADMIN: "Admins can manage users, centers, departments and settings, and see everyone's tasks and reports.",
  MANAGER: "Managers can see and review the tasks and reports of the people who report to them.",
  EMPLOYEE: "Employees only see tasks they're assigned to, created or watch, and their own reports.",
};
const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;

/** Everyone below `userId` in the reporting tree (who can't take over their manager's reports). */
function downlineOf(users: User[], userId: string): Set<string> {
  const out = new Set<string>();
  const queue = [userId];
  while (queue.length) {
    const current = queue.pop()!;
    for (const u of users) {
      if (u.managerId === current && !out.has(u.id)) {
        out.add(u.id);
        queue.push(u.id);
      }
    }
  }
  return out;
}

type Pending =
  | { kind: "role"; user: User; role: Role }
  | { kind: "status"; user: User; status: string }
  | { kind: "remove"; user: User }
  | { kind: "revoke"; invite: Invite };

export default function UsersPage() {
  const [showInvite, setShowInvite] = useState(false);
  // Links from the setup checklist land here with the invite form already open.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("invite") === "1") {
      setShowInvite(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [pending, setPending] = useState<Pending | null>(null);
  const { user: me } = useAuth();
  const usersQuery = useUsersList();
  const { data } = usersQuery;
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const queryClient = useQueryClient();

  const { data: invites } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => (await api.get<Invite[]>("/users/invites")).data,
  });

  const userName = (id: string) => data?.items.find((u) => u.id === id)?.name ?? "User";
  const inviteEmail = (id: string) => invites?.find((i) => i.id === id)?.email ?? "invite";

  const resendInvite = useMutation({
    mutationFn: (id: string) => api.post<InviteDelivery>(`/users/invites/${id}/resend`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }),
    meta: {
      successMessage: (res: { data: InviteDelivery }, id: string) =>
        res.data.emailDelivered
          ? `Invite resent to ${inviteEmail(id)}`
          : `New link created for ${inviteEmail(id)}, but no email went out. Use Copy link to send it yourself.`,
      errorTitle: (id: string) => `Couldn't resend the invite to ${inviteEmail(id)}`,
    },
  });

  const cancelInvite = useMutation({
    mutationFn: (id: string) => api.delete(`/users/invites/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invites"] }),
    meta: {
      successMessage: (_: unknown, id: string) => `Invite to ${inviteEmail(id)} revoked`,
      errorTitle: "Couldn't revoke the invite",
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api.patch(`/users/${id}/role`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    meta: {
      successMessage: (_: unknown, v: { id: string; role: Role }) => `${userName(v.id)} is now ${roleLabel[v.role]}`,
      errorTitle: (v: { id: string }) => `Couldn't change ${userName(v.id)}'s role`,
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patch(`/users/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    meta: {
      successMessage: (_: unknown, v: { id: string; status: string }) =>
        `${userName(v.id)} marked ${statusLabel[v.status] ?? v.status}`,
      errorTitle: (v: { id: string }) => `Couldn't change ${userName(v.id)}'s status`,
    },
  });

  const updateFields = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/users/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    meta: {
      successMessage: (_: unknown, v: { id: string; data: Record<string, unknown> }) =>
        `Updated ${userName(v.id)}'s ${fieldLabel[Object.keys(v.data)[0]] ?? "details"}`,
      errorTitle: (v: { id: string; data: Record<string, unknown> }) =>
        `Couldn't change ${userName(v.id)}'s ${fieldLabel[Object.keys(v.data)[0]] ?? "details"}`,
    },
  });

  const removeUser = useMutation({
    mutationFn: ({ id, reassignReportsTo }: { id: string; reassignReportsTo?: string }) =>
      api.delete(`/users/${id}`, { params: { reassignReportsTo } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["hierarchy-tree"] });
    },
    meta: {
      successMessage: (_: unknown, v: { id: string }) => `${userName(v.id)} removed`,
      errorTitle: (v: { id: string }) => `Couldn't remove ${userName(v.id)}`,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Users</h1>
        <button onClick={() => setShowInvite(true)} className={btnPrimary}>
          <IconPlus className="w-4 h-4" /> Invite user
        </button>
      </div>

      {usersQuery.isError && !data && (
        <QueryError
          title="Couldn't load users"
          error={usersQuery.error}
          onRetry={() => usersQuery.refetch()}
          retrying={usersQuery.isFetching}
        />
      )}
      {usersQuery.isPending && <LoadingText />}

      {data && (
        <div className={`${card} overflow-x-auto`}>
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
                    <div className="flex items-center gap-2">
                      <Avatar name={u.name} size="sm" />
                      <div>
                        <div className="font-medium text-gray-800">{u.name}</div>
                        <div className="text-xs text-subtle">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {u.role === "OWNER" ? (
                      "OWNER"
                    ) : u.id === me?.id ? (
                      <span title="You can't change your own role" className="cursor-not-allowed text-gray-500">
                        {u.role}
                      </span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => setPending({ kind: "role", user: u, role: e.target.value as Role })}
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
                    ) : u.id === me?.id ? (
                      <span title="You can't change your own status" className="cursor-not-allowed text-gray-500">
                        {statusLabel[u.status ?? "ACTIVE"]}
                      </span>
                    ) : (
                      <select
                        value={u.status}
                        onChange={(e) => {
                          const status = e.target.value;
                          // Reactivating is harmless; anything else stops them signing in, so confirm it.
                          if (status === "ACTIVE") updateStatus.mutate({ id: u.id, status });
                          else setPending({ kind: "status", user: u, status });
                        }}
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
                      <ActionMenu
                        label={`Actions for ${u.name}`}
                        items={[
                          {
                            label: "Remove user…",
                            danger: true,
                            disabled: u.id === me?.id,
                            title: u.id === me?.id ? "You can't remove your own account" : undefined,
                            onSelect: () => setPending({ kind: "remove", user: u }),
                          },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invites && invites.length > 0 && (
        <div className={card}>
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-sm font-medium text-gray-700">Pending invites</div>
            {invites.some((i) => i.emailConfigured === false) && (
              <p className="text-xs text-amber-800 mt-1">
                Email isn't set up on this server, so invites aren't emailed. Use Copy link and send it to them yourself.
              </p>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {invites.map((invite) => {
              const expired = new Date(invite.expiresAt) < new Date();
              return (
                <div key={invite.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <div className="text-gray-800">{invite.email}</div>
                    <div className="text-xs text-subtle">
                      {invite.role} · sent {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })} ·{" "}
                      {expired ? (
                        <span className="text-red-500">expired</span>
                      ) : (
                        <>expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}</>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {invite.inviteUrl && <CopyLinkButton url={invite.inviteUrl} />}
                    <button
                      onClick={() => resendInvite.mutate(invite.id)}
                      disabled={resendInvite.isPending}
                      className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => setPending({ kind: "revoke", invite })}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pending?.kind === "role" && (
        <ConfirmDialog
          title={`Make ${pending.user.name} ${withArticle(roleLabel[pending.role])}?`}
          description={
            <>
              <p>{roleSummary[pending.role]}</p>
              {pending.user.role === "ADMIN" && pending.role !== "ADMIN" && (
                <p className="mt-2">They'll lose access to the admin pages.</p>
              )}
            </>
          }
          confirmLabel={`Make ${roleLabel[pending.role]}`}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await updateRole.mutateAsync({ id: pending.user.id, role: pending.role }).catch(() => {});
            setPending(null);
          }}
        />
      )}

      {pending?.kind === "status" && (
        <ConfirmDialog
          title={`Mark ${pending.user.name} as ${statusLabel[pending.status] ?? pending.status}?`}
          description={
            <p>
              {statusLabel[pending.status] ?? pending.status} users can't sign in. Anyone already signed in is signed out
              within minutes. You can set them back to Active at any time.
            </p>
          }
          confirmLabel={`Mark ${statusLabel[pending.status] ?? pending.status}`}
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await updateStatus.mutateAsync({ id: pending.user.id, status: pending.status }).catch(() => {});
            setPending(null);
          }}
        />
      )}

      {pending?.kind === "revoke" && (
        <ConfirmDialog
          title={`Revoke the invite to ${pending.invite.email}?`}
          description={<p>The link they were sent will stop working. You can invite them again later.</p>}
          confirmLabel="Revoke invite"
          tone="danger"
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            await cancelInvite.mutateAsync(pending.invite.id).catch(() => {});
            setPending(null);
          }}
        />
      )}

      {pending?.kind === "remove" && data && (
        <RemoveUserDialog
          user={pending.user}
          users={data.items}
          onCancel={() => setPending(null)}
          onConfirm={async (reassignReportsTo) => {
            await removeUser.mutateAsync({ id: pending.user.id, reassignReportsTo }).catch(() => {});
            setPending(null);
          }}
        />
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["invites"] })}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Set once the invite exists: the form is replaced by a confirmation with the link. */
  const [sent, setSent] = useState<(InviteDelivery & { email: string }) | null>(null);
  const queryClient = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<InviteDelivery>("/users/invite", {
        email,
        role,
        centerId: centerId || undefined,
        departmentId: departmentId || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onCreated();
      setSent({ ...data, email });
    } catch (err) {
      setError(getErrorMessage(err, "Failed to send invite"));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
        <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-popover p-6 w-full max-w-md">
          <h2 className="text-base font-semibold text-gray-900">{sent.emailDelivered ? "Invite sent" : "Invite created"}</h2>
          {sent.emailDelivered ? (
            <p className="text-sm text-gray-600 mt-2">
              We emailed {sent.email} a link to join. You can also share it yourself:
            </p>
          ) : (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
              {sent.emailConfigured
                ? `We couldn't email ${sent.email}. Copy the link below and send it to them yourself.`
                : `Email isn't set up on this server, so nothing was sent. Copy the link below and send it to ${sent.email} yourself.`}
            </p>
          )}
          <InviteLink url={sent.inviteUrl} />
          <p className="text-xs text-subtle mt-2">The link works for 7 days. Anyone with it can create the account, so share it only with them.</p>
          <div className="flex justify-end mt-4">
            <button onClick={onClose} className={btnPrimary} autoFocus>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-xl shadow-popover p-6 w-full max-w-sm">
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
          {(centers?.length ?? 0) > 0 && (
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
          )}
          {(departments?.length ?? 0) > 0 && (
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
          )}
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Text-style "Copy link" for a pending invite's row. */
function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        if (await copyText(url)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error("Couldn't copy the link", { description: "Open Resend to get a fresh link instead." });
        }
      }}
      className="text-xs text-brand-600 hover:underline"
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/** The invite link in a read-only box with a Copy button. */
function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Couldn't copy the link", { description: "Select it and copy it by hand." });
    }
  }
  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        readOnly
        value={url}
        aria-label="Invite link"
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 min-w-0 border border-gray-300 rounded-md px-2.5 py-1.5 text-sm bg-gray-50 text-gray-700"
      />
      <button type="button" onClick={copy} className={btnSecondary}>
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

function RemoveUserDialog({
  user,
  users,
  onCancel,
  onConfirm,
}: {
  user: User;
  users: User[];
  onCancel: () => void;
  onConfirm: (reassignReportsTo: string | undefined) => Promise<void>;
}) {
  const directReports = users.filter((u) => u.managerId === user.id);
  const unavailable = downlineOf(users, user.id);
  const candidates = users.filter((u) => u.id !== user.id && !unavailable.has(u.id) && u.status !== "INACTIVE");
  // Sensible default: their own manager takes over, if there is one and they can.
  const [newManagerId, setNewManagerId] = useState(
    user.managerId && candidates.some((c) => c.id === user.managerId) ? user.managerId : ""
  );

  return (
    <ConfirmDialog
      title={`Remove ${user.name}?`}
      description={
        <p>
          They'll no longer be able to sign in or appear in lists. Their tasks, comments and history stay as they are.
        </p>
      }
      confirmLabel="Remove user"
      tone="danger"
      onCancel={onCancel}
      onConfirm={() => onConfirm(newManagerId || undefined)}
    >
      {directReports.length > 0 && (
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">
            {directReports.length === 1 ? "1 person reports" : `${directReports.length} people report`} to {user.name}.
            Who should they report to now?
          </span>
          <select
            value={newManagerId}
            onChange={(e) => setNewManagerId(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          >
            <option value="">No one (top level of the org chart)</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </ConfirmDialog>
  );
}
