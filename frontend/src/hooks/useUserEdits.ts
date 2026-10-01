import { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Role, User } from "@/types";
import { findCached, patchCached, useInstantEdit } from "@/hooks/useInstantEdit";
import { useCenters, useDepartments } from "@/hooks/useLookups";

export const roleLabel: Record<Role, string> = { OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };
export const statusLabel: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Inactive", ON_LEAVE: "On leave" };

/** One change to one person: plain fields, their role, or their status. */
export type UserEdit =
  | { id: string; kind: "fields"; data: Partial<Pick<User, "centerId" | "departmentId" | "managerId" | "title" | "name">> }
  | { id: string; kind: "role"; role: Role }
  | { id: string; kind: "status"; status: string };

const USERS = ["users"];

/**
 * Every edit to a person (center, department, manager, job title, role, status) goes through here:
 * it shows at once, rolls back with a toast if it fails, and the toast offers Undo.
 */
export function useUserEdits() {
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();

  return useInstantEdit<UserEdit>({
    keys: [USERS],
    alsoRefetch: [["hierarchy-tree"]],
    request: (e) => {
      if (e.kind === "role") return api.patch(`/users/${e.id}/role`, { role: e.role });
      if (e.kind === "status") return api.patch(`/users/${e.id}/status`, { status: e.status });
      return api.patch(`/users/${e.id}`, e.data);
    },
    optimistic: (qc, e) => {
      patchCached<User>(qc, USERS, e.id, (u) => {
        if (e.kind === "role") return { ...u, role: e.role };
        if (e.kind === "status") return { ...u, status: e.status as User["status"] };
        const next: User = { ...u, ...e.data };
        if ("centerId" in e.data) next.center = centers?.find((c) => c.id === e.data.centerId) ?? null;
        if ("departmentId" in e.data) next.department = departments?.find((d) => d.id === e.data.departmentId) ?? null;
        if ("managerId" in e.data) {
          const m = findCached<User>(qc, USERS, e.data.managerId ?? "");
          next.manager = m ? { id: m.id, name: m.name, email: m.email } : null;
        }
        return next;
      });
    },
    inverse: (qc, e) => {
      const before = findCached<User>(qc, USERS, e.id);
      if (!before) return null;
      if (e.kind === "role") return { id: e.id, kind: "role", role: before.role };
      if (e.kind === "status") return { id: e.id, kind: "status", status: before.status ?? "ACTIVE" };
      const data: Record<string, unknown> = {};
      for (const key of Object.keys(e.data) as (keyof typeof e.data)[]) data[key] = before[key] ?? null;
      return { id: e.id, kind: "fields", data } as UserEdit;
    },
    successMessage: (e, qc) => describe(e, qc, centers, departments),
    errorTitle: (e, qc) => `Couldn't change ${nameOf(qc, e.id)}'s ${e.kind === "fields" ? fieldName(e.data) : e.kind}`,
  });
}

const nameOf = (qc: QueryClient, id: string) => findCached<User>(qc, USERS, id)?.name ?? "User";

function fieldName(data: Record<string, unknown>): string {
  const key = Object.keys(data)[0];
  return { centerId: "center", departmentId: "department", managerId: "manager", title: "job title", name: "name" }[key] ?? "details";
}

function describe(e: UserEdit, qc: QueryClient, centers: { id: string; name: string }[] | undefined, departments: { id: string; name: string }[] | undefined): string {
  const who = nameOf(qc, e.id);
  if (e.kind === "role") return `${who} is now ${withArticle(roleLabel[e.role])}`;
  if (e.kind === "status") return `${who} marked ${statusLabel[e.status] ?? e.status}`;
  const key = Object.keys(e.data)[0] as keyof typeof e.data;
  const value = e.data[key] as string | null | undefined;
  if (key === "managerId") return value ? `${who} now reports to ${nameOf(qc, value)}` : `${who} no longer has a manager`;
  if (key === "centerId") return value ? `${who} moved to ${centers?.find((c) => c.id === value)?.name ?? "the new center"}` : `${who} removed from their center`;
  if (key === "departmentId") return value ? `${who} moved to ${departments?.find((d) => d.id === value)?.name ?? "the new department"}` : `${who} removed from their department`;
  if (key === "title") return value ? `${who} is now ${value}` : `Cleared ${who}'s job title`;
  return `Updated ${who}'s ${fieldName(e.data)}`;
}

const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
