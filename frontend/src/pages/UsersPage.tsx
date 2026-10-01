import { useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { Invite, InviteDelivery, Paginated, Role, User } from "@/types";
import { copyText } from "@/lib/clipboard";
import { useAuth } from "@/context/AuthContext";
import { useUsersList, useCenters, useDepartments } from "@/hooks/useLookups";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { roleLabel, statusLabel, useUserEdits } from "@/hooks/useUserEdits";
import FormField, { inputClass } from "@/components/FormField";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import Dialog from "@/components/Dialog";
import ActionMenu from "@/components/ActionMenu";
import EmptyState from "@/components/EmptyState";
import QueryError, { LoadingText } from "@/components/QueryError";
import UserDrawer, { downlineOf } from "@/components/UserDrawer";
import { RoleBadge, UserStatusBadge } from "@/components/UserBadges";
import { IconPlus, IconSearch, IconUsers } from "@/components/icons";
import { btnPrimary, btnSecondary, card, filterControl } from "@/lib/ui";

const PAGE_SIZE = 20;
const TABS = ["members", "invites"] as const;

/** What each role can do, shown when confirming a change so nobody grants access by accident. */
const roleSummary: Record<Role, string> = {
  OWNER: "",
  ADMIN: "Admins can manage users, centers, departments and settings, and see everyone's tasks and reports.",
  MANAGER: "Managers can see and review the tasks and reports of the people who report to them.",
  EMPLOYEE: "Employees only see tasks they're assigned to, created or watch, and their own reports.",
};
const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;

type Pending =
  | { kind: "role"; user: User; role: Role }
  | { kind: "status"; user: User; status: string }
  | { kind: "remove"; user: User }
  | { kind: "revoke"; invite: Invite };

/**
 * Filters, page, tab and the open person all live in the URL, so a refresh or a shared link
 * shows the same list.
 */
export default function UsersPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab") as (typeof TABS)[number]) ? (params.get("tab") as (typeof TABS)[number]) : "members";
  const roleFilter = params.get("role") ?? "";
  const statusFilter = params.get("status") ?? "";
  const centerFilter = params.get("center") ?? "";
  const departmentFilter = params.get("department") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const openUserId = params.get("user");

  const [showInvite, setShowInvite] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [searchInput, setSearchInput] = useState(params.get("q") ?? "");
  const search = useDebouncedValue(searchInput, 300);

  function updateParams(changes: Record<string, string | null>, opts: { keepPage?: boolean } = {}) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        if (!opts.keepPage && !("page" in changes)) next.delete("page");
        return next;
      },
      { replace: true }
    );
  }

  // Links from the setup checklist land here with the invite form already open.
  useEffect(() => {
    if (params.get("invite") === "1") {
      setShowInvite(true);
      updateParams({ invite: null }, { keepPage: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if ((params.get("q") ?? "") !== search) updateParams({ q: search || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const directory = useUsersList();
  const everyone = directory.data?.items ?? [];

  const filters = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
    centerId: centerFilter || undefined,
    departmentId: departmentFilter || undefined,
  };
  const anyFilter = !!(search || roleFilter || statusFilter || centerFilter || departmentFilter);
  const membersQuery = useQuery({
    queryKey: ["users", "members", filters],
    queryFn: async () => (await api.get<Paginated<User>>("/users", { params: filters })).data,
    placeholderData: keepPreviousData,
  });
  const data = membersQuery.data;
  const lastPage = data ? Math.max(1, data.meta.totalPages) : 1;
  // Filtering can leave the current page past the end.
  useEffect(() => {
    if (data && page > lastPage) updateParams({ page: lastPage > 1 ? String(lastPage) : null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, lastPage]);

  const { data: invites } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => (await api.get<Invite[]>("/users/invites")).data,
  });

  const userName = (id: string) => everyone.find((u) => u.id === id)?.name ?? "User";
  const inviteEmail = (id: string) => invites?.find((i) => i.id === id)?.email ?? "invite";
  const edits = useUserEdits();

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

  const memberCount = directory.data?.items.length;
  const from = data && data.meta.total > 0 ? (data.meta.page - 1) * data.meta.pageSize + 1 : 0;
  const to = data ? Math.min(data.meta.total, data.meta.page * data.meta.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Users</h1>
        <button onClick={() => setShowInvite(true)} className={btnPrimary}>
          <IconPlus className="w-4 h-4" /> Invite user
        </button>
      </div>

      <div role="tablist" aria-label="People" className="flex gap-1 border-b border-gray-200">
        {(
          [
            ["members", `Members${memberCount != null ? ` (${memberCount})` : ""}`],
            ["invites", `Pending invites${invites ? ` (${invites.length})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => updateParams({ tab: key === "members" ? null : key }, { keepPage: true })}
            className={`min-h-10 md:min-h-0 px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
              tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <IconSearch className="w-4 h-4 text-subtle absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                placeholder="Search name or email…"
                aria-label="Search people"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className={`${filterControl(!!searchInput)} pl-8 w-56`}
              />
            </div>
            <select aria-label="Role" value={roleFilter} onChange={(e) => updateParams({ role: e.target.value || null })} className={filterControl(!!roleFilter)}>
              <option value="">All roles</option>
              {(["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
            <select aria-label="Status" value={statusFilter} onChange={(e) => updateParams({ status: e.target.value || null })} className={filterControl(!!statusFilter)}>
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {(centers?.length ?? 0) > 0 && (
              <select aria-label="Center" value={centerFilter} onChange={(e) => updateParams({ center: e.target.value || null })} className={filterControl(!!centerFilter)}>
                <option value="">All centers</option>
                {centers?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {(departments?.length ?? 0) > 0 && (
              <select aria-label="Department" value={departmentFilter} onChange={(e) => updateParams({ department: e.target.value || null })} className={filterControl(!!departmentFilter)}>
                <option value="">All departments</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
            {anyFilter && (
              <button
                onClick={() => {
                  setSearchInput("");
                  updateParams({ q: null, role: null, status: null, center: null, department: null });
                }}
                className="text-sm text-brand-700 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {membersQuery.isError && !data && (
            <QueryError title="Couldn't load users" error={membersQuery.error} onRetry={() => membersQuery.refetch()} retrying={membersQuery.isFetching} />
          )}
          {membersQuery.isPending && <LoadingText />}

          {data && data.items.length === 0 && (
            <EmptyState
              icon={<IconUsers />}
              title={anyFilter ? "No one matches those filters" : "No users yet"}
              description={anyFilter ? "Try a different search, or clear the filters to see everyone." : "Invite your team to get started."}
              primary={anyFilter ? { label: "Clear filters", onClick: () => { setSearchInput(""); updateParams({ q: null, role: null, status: null, center: null, department: null }); } } : { label: "Invite user", onClick: () => setShowInvite(true) }}
            />
          )}

          {data && data.items.length > 0 && (
            <>
            {/* Phones: one card per person; tapping it opens the edit sheet. */}
            <ul className={`md:hidden space-y-2 ${membersQuery.isPlaceholderData ? "opacity-70" : ""}`} aria-label="People">
              {data.items.map((u) => (
                <li key={u.id} className={`${card} flex items-start gap-1 pr-1`}>
                  <button
                    onClick={() => updateParams({ user: u.id }, { keepPage: true })}
                    className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                    aria-label={`Open ${u.name}`}
                  >
                    <Avatar name={u.name} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-gray-900">{u.name}</span>
                      <span className="block truncate text-xs text-gray-600">{u.title ? `${u.title} · ${u.email}` : u.email}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        <RoleBadge role={u.role} />
                        <UserStatusBadge status={u.status} />
                      </span>
                      <span className="mt-1.5 block text-xs text-gray-600">
                        {[u.center?.name, u.department?.name, u.manager ? `Reports to ${u.manager.name}` : null].filter(Boolean).join(" · ") || "No center, department or manager"}
                      </span>
                    </span>
                  </button>
                  {u.role !== "OWNER" && (
                    <span className="mt-1">
                      <ActionMenu
                        label={`Actions for ${u.name}`}
                        items={[
                          { label: "Edit details", onSelect: () => updateParams({ user: u.id }, { keepPage: true }) },
                          {
                            label: "Remove user…",
                            danger: true,
                            disabled: u.id === me?.id,
                            title: u.id === me?.id ? "You can't remove your own account" : undefined,
                            onSelect: () => setPending({ kind: "remove", user: u }),
                          },
                        ]}
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className={`hidden md:block ${card} overflow-x-auto ${membersQuery.isPlaceholderData ? "opacity-70" : ""}`}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Role</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Center</th>
                    <th className="text-left px-4 py-2">Department</th>
                    <th className="text-left px-4 py-2">Manager</th>
                    <th className="px-4 py-2 w-10">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => updateParams({ user: u.id }, { keepPage: true })}
                      className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateParams({ user: u.id }, { keepPage: true });
                          }}
                          className="flex items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rounded"
                          aria-label={`Open ${u.name}`}
                        >
                          <Avatar name={u.name} size="sm" />
                          <span>
                            <span className="block font-medium text-gray-800">{u.name}</span>
                            <span className="block text-xs text-subtle">{u.title ? `${u.title} · ${u.email}` : u.email}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-2">
                        <UserStatusBadge status={u.status} />
                      </td>
                      <td className="px-4 py-2 text-gray-700">{u.center?.name ?? <span className="text-subtle">—</span>}</td>
                      <td className="px-4 py-2 text-gray-700">{u.department?.name ?? <span className="text-subtle">—</span>}</td>
                      <td className="px-4 py-2 text-gray-700">{u.manager?.name ?? <span className="text-subtle">—</span>}</td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {u.role !== "OWNER" && (
                          <ActionMenu
                            label={`Actions for ${u.name}`}
                            items={[
                              { label: "Edit details", onSelect: () => updateParams({ user: u.id }, { keepPage: true }) },
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
            </>
          )}

          {data && data.meta.total > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span aria-live="polite">
                {from}–{to} of {data.meta.total}
              </span>
              {lastPage > 1 && (
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => updateParams({ page: page - 1 > 1 ? String(page - 1) : null })} className={btnSecondary}>
                    Previous
                  </button>
                  <button disabled={page >= lastPage} onClick={() => updateParams({ page: String(page + 1) })} className={btnSecondary}>
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "invites" && (
        <>
          {invites && invites.length === 0 && (
            <EmptyState
              icon={<IconUsers />}
              title="No pending invites"
              description="People you invite show up here until they accept."
              primary={{ label: "Invite user", onClick: () => setShowInvite(true) }}
            />
          )}
          {invites && invites.length > 0 && (
            <div className={card}>
              {invites.some((i) => i.emailConfigured === false) && (
                <p className="px-4 py-3 border-b border-gray-100 text-xs text-amber-800">
                  Email isn't set up on this server, so invites aren't emailed. Use Copy link and send it to them yourself.
                </p>
              )}
              <div className="divide-y divide-gray-100">
                {invites.map((invite) => {
                  const expired = new Date(invite.expiresAt) < new Date();
                  return (
                    <div key={invite.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="text-gray-800">{invite.email}</div>
                        <div className="text-xs text-subtle">
                          {roleLabel[invite.role]}
                          {invite.title && ` · ${invite.title}`}
                          {invite.managerName && ` · reports to ${invite.managerName}`} · sent{" "}
                          {formatDistanceToNow(new Date(invite.createdAt), { addSuffix: true })} ·{" "}
                          {expired ? <span className="text-red-700">expired</span> : <>expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {invite.inviteUrl && <CopyLinkButton url={invite.inviteUrl} />}
                        <button
                          onClick={() => resendInvite.mutate(invite.id)}
                          disabled={resendInvite.isPending}
                          className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                        >
                          Resend
                        </button>
                        <button onClick={() => setPending({ kind: "revoke", invite })} className="text-xs text-red-600 hover:underline">
                          Revoke
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {openUserId && (
        <UserDrawer
          key={openUserId}
          userId={openUserId}
          me={everyone.find((u) => u.id === me?.id) ?? (me as User | undefined)}
          onClose={() => updateParams({ user: null }, { keepPage: true })}
          onChangeRole={(user, role) => setPending({ kind: "role", user, role })}
          onChangeStatus={(user, status) => setPending({ kind: "status", user, status })}
          onRemove={(user) => setPending({ kind: "remove", user })}
        />
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
          onConfirm={() => {
            edits.mutate({ id: pending.user.id, kind: "role", role: pending.role });
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
          onConfirm={() => {
            edits.mutate({ id: pending.user.id, kind: "status", status: pending.status });
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

      {pending?.kind === "remove" && (
        <RemoveUserDialog
          user={pending.user}
          users={everyone}
          onCancel={() => setPending(null)}
          onConfirm={async (reassignReportsTo) => {
            const removed = pending.user.id;
            await removeUser.mutateAsync({ id: removed, reassignReportsTo }).catch(() => {});
            setPending(null);
            if (openUserId === removed) updateParams({ user: null }, { keepPage: true });
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
  const { data: directory } = useUsersList();
  const managers = (directory?.items ?? []).filter((u) => u.status === "ACTIVE");
  const [managerId, setManagerId] = useState("");
  const [title, setTitle] = useState("");
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
        managerId: managerId || undefined,
        title: title.trim() || undefined,
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
      <Dialog label={sent.emailDelivered ? "Invite sent" : "Invite created"} size="md" onClose={onClose}>
        <div className="p-6">
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
      </Dialog>
    );
  }

  return (
    <Dialog label="Invite user" size="sm" onClose={onClose} closeOnOutside={!email}>
      <div className="p-6">
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
          <FormField label="Manager (optional)">
            <select className={inputClass} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">No one yet (top level)</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Job title (optional)">
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Support lead" />
          </FormField>
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
    </Dialog>
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
