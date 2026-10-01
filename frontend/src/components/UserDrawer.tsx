import { ReactNode, useId } from "react";
import { User } from "@/types";
import Avatar from "@/components/Avatar";
import InlineText, { fieldClass } from "@/components/InlineText";
import { RoleBadge, UserStatusBadge } from "@/components/UserBadges";
import { IconX } from "@/components/icons";
import { btnDanger } from "@/lib/ui";
import { roleLabel, statusLabel, useUserEdits } from "@/hooks/useUserEdits";
import { useCenters, useDepartments, useUsersList } from "@/hooks/useLookups";
import QueryError from "@/components/QueryError";

/** Everyone below `userId` in the reporting tree (who can't be picked as their manager). */
export function downlineOf(users: User[], userId: string): Set<string> {
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

interface Props {
  userId: string;
  me: User | null | undefined;
  onClose: () => void;
  /** Role and status changes lock people out or grant access, so the page confirms them first. */
  onChangeRole: (user: User, role: User["role"]) => void;
  onChangeStatus: (user: User, status: string) => void;
  onRemove: (user: User) => void;
}

/** One person's details; every field saves as soon as it changes (with Undo in the toast). */
export default function UserDrawer({ userId, me, onClose, onChangeRole, onChangeStatus, onRemove }: Props) {
  const directory = useUsersList();
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const edits = useUserEdits();
  const uid = useId();
  const fid = (n: string) => `${uid}-${n}`;

  const users = directory.data?.items ?? [];
  const user = users.find((u) => u.id === userId);

  const shell = (children: ReactNode) => (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="User details" className="relative w-full max-w-md bg-white h-full overflow-y-auto shadow-xl p-4 sm:p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-subtle hover:text-gray-700" aria-label="Close">
          <IconX className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );

  if (!user) {
    return shell(
      directory.isError ? (
        <QueryError className="mt-10" title="Couldn't load this person" error={directory.error} onRetry={() => directory.refetch()} retrying={directory.isFetching} />
      ) : directory.isPending ? (
        <div className="text-sm text-subtle mt-1">Loading…</div>
      ) : (
        <div className="mt-10 text-sm text-gray-700">This person isn't in your organization any more.</div>
      )
    );
  }

  const isOwner = user.role === "OWNER";
  const isMe = user.id === me?.id;
  const blocked = downlineOf(users, user.id);
  const managerOptions = users.filter((m) => m.id !== user.id && !blocked.has(m.id) && m.status !== "INACTIVE");
  const reports = users.filter((u) => u.managerId === user.id);

  return shell(
    <>
      <div className="flex items-center gap-3 pr-8">
        <Avatar name={user.name} size="md" />
        <div className="min-w-0 flex-1">
          <InlineText
            value={user.name}
            ariaLabel="Name"
            required
            maxLength={120}
            className="!text-lg font-semibold -ml-2"
            onCommit={(name) => edits.mutate({ id: user.id, kind: "fields", data: { name } })}
          />
          <div className="text-sm text-gray-600 truncate">{user.email}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <RoleBadge role={user.role} />
        <UserStatusBadge status={user.status} />
      </div>

      <dl className="mt-5 -mx-2">
        <Row label="Job title" htmlFor={fid("title")}>
          <InlineText
            id={fid("title")}
            value={user.title ?? ""}
            ariaLabel="Job title"
            placeholder="Add a job title"
            maxLength={120}
            onCommit={(title) => edits.mutate({ id: user.id, kind: "fields", data: { title: title || null } })}
          />
        </Row>
        <Row label="Role" htmlFor={fid("role")}>
          {isOwner || isMe ? (
            <p className="px-2 py-1 text-sm text-gray-700">
              {roleLabel[user.role]} <span className="text-xs text-subtle">· {isOwner ? "the owner's role can't change" : "you can't change your own role"}</span>
            </p>
          ) : (
            <select
              id={fid("role")}
              className={fieldClass}
              value={user.role}
              onChange={(e) => onChangeRole(user, e.target.value as User["role"])}
            >
              {(["ADMIN", "MANAGER", "EMPLOYEE"] as const).map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Status" htmlFor={fid("status")}>
          {isOwner || isMe ? (
            <p className="px-2 py-1 text-sm text-gray-700">
              {statusLabel[user.status ?? "ACTIVE"]} <span className="text-xs text-subtle">· {isOwner ? "the owner is always active" : "you can't change your own status"}</span>
            </p>
          ) : (
            <select
              id={fid("status")}
              className={fieldClass}
              value={user.status ?? "ACTIVE"}
              onChange={(e) => {
                const status = e.target.value;
                // Reactivating is harmless; anything else stops them signing in, so confirm it.
                if (status === "ACTIVE") edits.mutate({ id: user.id, kind: "status", status });
                else onChangeStatus(user, status);
              }}
            >
              {Object.entries(statusLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Row>
        <Row label="Center" htmlFor={fid("center")}>
          <select
            id={fid("center")}
            className={fieldClass}
            value={user.centerId ?? ""}
            onChange={(e) => edits.mutate({ id: user.id, kind: "fields", data: { centerId: e.target.value || null } })}
          >
            <option value="">None</option>
            {centers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Department" htmlFor={fid("department")}>
          <select
            id={fid("department")}
            className={fieldClass}
            value={user.departmentId ?? ""}
            onChange={(e) => edits.mutate({ id: user.id, kind: "fields", data: { departmentId: e.target.value || null } })}
          >
            <option value="">None</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Manager" htmlFor={fid("manager")}>
          <select
            id={fid("manager")}
            className={fieldClass}
            value={user.managerId ?? ""}
            onChange={(e) => edits.mutate({ id: user.id, kind: "fields", data: { managerId: e.target.value || null } })}
          >
            <option value="">No one (top level)</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Row>
      </dl>

      <section className="mt-6" aria-label="Direct reports">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Direct reports ({reports.length})</h3>
        {reports.length === 0 ? (
          <p className="text-xs text-subtle">No one reports to {user.name} yet.</p>
        ) : (
          <ul className="space-y-1">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm text-gray-800">
                <Avatar name={r.name} size="xs" />
                {r.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isOwner && (
        <div className="mt-8 border-t border-gray-100 pt-4">
          <button
            onClick={() => onRemove(user)}
            disabled={isMe}
            title={isMe ? "You can't remove your own account" : undefined}
            className={`${btnDanger} -ml-3`}
          >
            Remove user…
          </button>
        </div>
      )}
    </>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2 px-2 py-0.5">
      <dt className="text-xs font-medium text-gray-600">
        <label htmlFor={htmlFor}>{label}</label>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
