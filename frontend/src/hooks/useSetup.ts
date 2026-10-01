import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Invite, Paginated, Task } from "@/types";
import { useCenters, useDepartments, useUsersList } from "@/hooks/useLookups";

export interface SetupStep {
  key: "center" | "departments" | "team" | "task" | "managers";
  title: string;
  /** Shown while the step is still to do. */
  todo: string;
  /** Shown once it's done. */
  done: string;
  action: { label: string; to: string };
  complete: boolean;
}

const dismissedKey = (userId: string) => `setup-dismissed:${userId}`;
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Where a new owner is in setting up the workspace, worked out from data the app already loads
 * (centers, departments, people, invites, tasks) — nothing extra is stored except "dismissed".
 */
export function useSetup() {
  const { user } = useAuth();
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const { data: users } = useUsersList();
  const { data: invites } = useQuery({
    queryKey: ["invites"],
    queryFn: async () => (await api.get<Invite[]>("/users/invites")).data,
    enabled: isAdmin,
  });
  const { data: taskCount } = useQuery({
    queryKey: ["tasks", "count"],
    queryFn: async () => (await api.get<Paginated<Task>>("/tasks", { params: { pageSize: 1, view: "all" } })).data.meta.total,
    enabled: isAdmin,
  });

  const key = user ? dismissedKey(user.id) : "";
  const dismissed = useSyncExternalStore(
    subscribe,
    () => (key ? localStorage.getItem(key) === "1" : false),
    () => false
  );
  const dismiss = useCallback(() => {
    if (!key) return;
    localStorage.setItem(key, "1");
    listeners.forEach((l) => l());
  }, [key]);

  // The "all set up" card is a reward for finishing setup, so only people who actually saw the
  // checklist unfinished get it — an established workspace never needs congratulating.
  const seenKey = user ? `setup-seen-incomplete:${user.id}` : "";

  const loaded = !!centers && !!departments && !!users && !!invites && taskCount !== undefined;
  const members = users?.items ?? [];
  const hqName = centers?.[0]?.name;

  const steps: SetupStep[] = [
    {
      key: "center",
      title: "Add a center",
      todo: "Centers are your offices or sites. Add the places your people work from.",
      done: hqName ? `${hqName} is set up. Add more offices any time.` : "Your first center is set up.",
      action: { label: "Add a center", to: "/organization" },
      complete: (centers?.length ?? 0) > 0,
    },
    {
      key: "departments",
      title: "Create departments",
      todo: "Group people by function — Engineering, Sales, Support — to filter work and reports by team.",
      done: `${departments?.length ?? 0} ${departments?.length === 1 ? "department" : "departments"} created.`,
      action: { label: "Create departments", to: "/organization?tab=departments" },
      complete: (departments?.length ?? 0) > 0,
    },
    {
      key: "team",
      title: "Invite your team",
      todo: "Invite the people you work with. You can share the invite link by hand if email isn't set up.",
      done: members.length > 1 ? `${members.length} people in the workspace.` : `${invites?.length ?? 0} invite${invites?.length === 1 ? "" : "s"} waiting to be accepted.`,
      action: { label: "Invite your team", to: "/users?invite=1" },
      complete: members.length > 1 || (invites?.length ?? 0) > 0,
    },
    {
      key: "task",
      title: "Create or import your first task",
      todo: "Add a task, or bring a whole backlog in from Excel.",
      done: `${taskCount ?? 0} ${taskCount === 1 ? "task" : "tasks"} so far.`,
      action: { label: "Create a task", to: "/tasks?new=1" },
      complete: (taskCount ?? 0) > 0,
    },
    {
      key: "managers",
      title: "Set managers",
      todo: "Say who reports to whom. Managers see their team's tasks and reports.",
      done: "Reporting lines are set.",
      action: { label: "Set managers", to: "/users" },
      complete: members.some((u) => u.role !== "OWNER" && !!u.managerId),
    },
  ];

  const doneCount = steps.filter((s) => s.complete).length;
  const nextKey = steps.find((s) => !s.complete)?.key ?? null;
  const incomplete = isAdmin && loaded && !dismissed && doneCount < steps.length;
  useEffect(() => {
    if (incomplete && seenKey) localStorage.setItem(seenKey, "1");
  }, [incomplete, seenKey]);
  const celebrate = isAdmin && loaded && !dismissed && doneCount === steps.length && !!seenKey && localStorage.getItem(seenKey) === "1";
  return {
    celebrate,
    steps,
    doneCount,
    total: steps.length,
    nextKey,
    allDone: doneCount === steps.length,
    loaded,
    dismissed,
    dismiss,
    isAdmin,
    /** No task exists yet (for admins only: other roles only see their own tasks). */
    noTasksYet: isAdmin && taskCount === 0,
    /** Show the sidebar pill / dashboard card. */
    active: incomplete,
  };
}
