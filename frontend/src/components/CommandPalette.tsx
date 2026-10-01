import { ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useTaskStatuses, useUsersList } from "@/hooks/useLookups";
import { taskHref } from "@/lib/links";
import { Paginated, Role, Task } from "@/types";
import Avatar from "@/components/Avatar";
import Dialog from "@/components/Dialog";
import StatusBadge from "@/components/StatusBadge";
import { IconBell, IconBoard, IconChart, IconHome, IconPlus, IconSearch, IconSettings, IconSitemap, IconUpload, IconUsers, IconBuilding } from "@/components/icons";

type Group = "Tasks" | "People" | "Pages" | "Actions";
const GROUP_ORDER: Group[] = ["Tasks", "People", "Pages", "Actions"];

interface Item {
  /** How well it matches what was typed: 0 starts with it, 1 a word starts with it, 2 contains it, 3 matched elsewhere. */
  score: number;
  id: string;
  group: Group;
  label: string;
  hint?: string;
  icon?: ReactNode;
  right?: ReactNode;
  run: () => void;
}

interface Entry {
  label: string;
  keywords?: string;
  to: string;
  roles: Role[];
  icon: ReactNode;
}

const ALL: Role[] = ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"];
const ADMINS: Role[] = ["OWNER", "ADMIN"];
const REVIEWERS: Role[] = ["OWNER", "ADMIN", "MANAGER"];
const icon = (node: ReactNode) => <span className="text-gray-500 [&>svg]:w-4 [&>svg]:h-4">{node}</span>;

const PAGES: Entry[] = [
  { label: "Dashboard", keywords: "home overview", to: "/", roles: ALL, icon: icon(<IconHome />) },
  { label: "Tasks", keywords: "board list kanban", to: "/tasks", roles: ALL, icon: icon(<IconBoard />) },
  { label: "Org Chart", keywords: "hierarchy reporting structure", to: "/hierarchy", roles: ALL, icon: icon(<IconSitemap />) },
  { label: "Weekly report", keywords: "reports submit", to: "/reports/weekly", roles: ALL, icon: icon(<IconChart />) },
  { label: "Monthly report", keywords: "reports", to: "/reports/monthly", roles: ALL, icon: icon(<IconChart />) },
  { label: "Team weekly", keywords: "reports review approve", to: "/reports/weekly/team", roles: REVIEWERS, icon: icon(<IconChart />) },
  { label: "Team monthly", keywords: "reports ranking", to: "/reports/monthly/team", roles: REVIEWERS, icon: icon(<IconChart />) },
  { label: "Notifications", keywords: "alerts inbox", to: "/notifications", roles: ALL, icon: icon(<IconBell />) },
  { label: "Users", keywords: "people team members invites", to: "/users", roles: ADMINS, icon: icon(<IconUsers />) },
  { label: "Organization", keywords: "centers departments sites offices", to: "/organization", roles: ADMINS, icon: icon(<IconBuilding />) },
  { label: "Settings", keywords: "statuses workflow", to: "/settings", roles: ADMINS, icon: icon(<IconSettings />) },
  { label: "Import tasks from Excel", keywords: "upload spreadsheet xlsx", to: "/tasks/import", roles: ADMINS, icon: icon(<IconUpload />) },
];

const ACTIONS: Entry[] = [
  { label: "New task", keywords: "create add", to: "/tasks?new=1", roles: ALL, icon: icon(<IconPlus />) },
  { label: "Submit weekly report", keywords: "write summary", to: "/reports/weekly", roles: ALL, icon: icon(<IconChart />) },
  { label: "Invite user", keywords: "add person teammate", to: "/users?invite=1", roles: ADMINS, icon: icon(<IconPlus />) },
];

const matches = (entry: Entry, q: string) => !q || `${entry.label} ${entry.keywords ?? ""}`.toLowerCase().includes(q);

function rank(label: string, q: string): number {
  if (!q) return 2;
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.includes(` ${q}`)) return 1;
  return l.includes(q) ? 2 : 3;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Jump to anything: tasks and people (as you type), pages, and common actions. Opened with Ctrl/Cmd+K or "/". */
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const q = query.trim().toLowerCase();
  const debounced = useDebouncedValue(q, 200);

  const { data: directory } = useUsersList();
  const { data: statuses } = useTaskStatuses();
  const tasksQuery = useQuery({
    queryKey: ["tasks", "palette", debounced],
    queryFn: async () => (await api.get<Paginated<Task>>("/tasks", { params: { search: debounced, view: "all", pageSize: 6 } })).data,
    enabled: debounced.length >= 2,
    placeholderData: keepPreviousData,
  });

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const items = useMemo<Item[]>(() => {
    if (!user) return [];
    const out: Item[] = [];
    const isAdmin = user.role === "OWNER" || user.role === "ADMIN";

    if (debounced.length >= 2 && q.length >= 2) {
      for (const t of tasksQuery.data?.items ?? []) {
        const s = statuses?.find((x) => x.key === t.status);
        out.push({
          score: rank(t.title, q),
          id: `task:${t.id}`,
          group: "Tasks",
          label: t.title,
          hint: t.assignee?.name ?? "Unassigned",
          icon: icon(<IconBoard />),
          right: s ? <StatusBadge label={s.label} color={s.color} /> : undefined,
          run: () => go(taskHref(t.id)),
        });
      }
    }
    if (q.length >= 1) {
      const people = (directory?.items ?? [])
        .filter((u) => u.status !== "INACTIVE" && `${u.name} ${u.email} ${u.title ?? ""}`.toLowerCase().includes(q))
        .slice(0, 5);
      for (const u of people) {
        out.push({
          score: rank(u.name, q),
          id: `user:${u.id}`,
          group: "People",
          label: u.name,
          hint: [u.title, u.email].filter(Boolean).join(" · "),
          icon: <Avatar name={u.name} size="xs" />,
          right: <span className="text-xs text-gray-600">{isAdmin ? "Open profile" : "Their tasks"}</span>,
          run: () => go(isAdmin ? `/users?user=${u.id}` : `/tasks?assignee=${u.id}`),
        });
      }
    }
    for (const p of PAGES.filter((e) => e.roles.includes(user.role) && matches(e, q))) {
      out.push({ score: rank(p.label, q), id: `page:${p.to}`, group: "Pages", label: p.label, icon: p.icon, run: () => go(p.to) });
    }
    for (const a of ACTIONS.filter((e) => e.roles.includes(user.role) && matches(e, q))) {
      out.push({ score: rank(a.label, q), id: `action:${a.label}`, group: "Actions", label: a.label, icon: a.icon, run: () => go(a.to) });
    }
    // Groups with the best match go first (ties keep Tasks, People, Pages, Actions); inside a group, best match first.
    const best = new Map<Group, number>();
    for (const item of out) best.set(item.group, Math.min(best.get(item.group) ?? 9, item.score));
    return out.sort(
      (a, b) =>
        (q ? best.get(a.group)! - best.get(b.group)! : 0) ||
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
        a.score - b.score
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, q, debounced, tasksQuery.data, directory, statuses]);

  // The first result is always ready for Enter; new results reset the selection.
  useEffect(() => setActive(0), [q, items.length]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, items.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[active]) items[active].run();
      else if (q) go(`/tasks?q=${encodeURIComponent(query.trim())}`);
    } else if (e.key === "Tab") {
      // One field and a list driven by arrow keys: keep focus where typing happens.
      e.preventDefault();
    }
  }

  const searching = debounced.length >= 2 && (tasksQuery.isFetching || debounced !== q);
  let lastGroup: Group | null = null;

  return (
    <Dialog label="Search and commands" size="lg" align="top" onClose={onClose} panelClassName="max-w-xl overflow-hidden">
      <div onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4">
          <IconSearch className="h-4 w-4 shrink-0 text-gray-500" />
          <input
            ref={inputRef}
            data-autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Search tasks, people, pages and actions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, people, pages…"
            className="h-12 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none"
          />
          <kbd className="rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600">esc</kbd>
        </div>

        <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto py-1">
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id} role="presentation">
                {header && (
                  <div role="presentation" className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                    {header}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => item.run()}
                  className={`mx-1 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${i === active ? "bg-brand-50 text-brand-900" : "text-gray-800"}`}
                >
                  <span className="flex w-5 shrink-0 justify-center">{item.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{item.label}</span>
                    {item.hint && <span className="block truncate text-xs text-gray-600">{item.hint}</span>}
                  </span>
                  {item.right}
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-700">
              {searching ? "Searching…" : q ? <>Nothing matches “{query.trim()}”. Press Enter to search every task for it.</> : "Start typing to search."}
            </div>
          )}
          {searching && items.length > 0 && <div className="px-4 py-1 text-xs text-gray-600">Searching tasks…</div>}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-100 bg-gray-50 px-4 py-2 text-[11px] text-gray-600">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
        <div role="status" aria-live="polite" className="sr-only">
          {items.length} {items.length === 1 ? "result" : "results"}
        </div>
      </div>
    </Dialog>
  );
}

/** Opens on Ctrl/Cmd+K anywhere, and on "/" when you aren't typing into a field. */
export function usePaletteHotkeys(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
