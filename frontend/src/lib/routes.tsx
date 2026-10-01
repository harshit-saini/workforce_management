import { Role } from "@/types";
import DashboardPage from "@/pages/DashboardPage";
import HierarchyPage from "@/pages/HierarchyPage";
import UsersPage from "@/pages/UsersPage";
import OrganizationPage from "@/pages/OrganizationPage";
import TasksPage from "@/pages/TasksPage";
import TaskImportPage from "@/pages/TaskImportPage";
import WeeklyReportPage from "@/pages/WeeklyReportPage";
import WeeklyTeamReportPage from "@/pages/WeeklyTeamReportPage";
import MonthlyReportPage from "@/pages/MonthlyReportPage";
import MonthlyTeamReportPage from "@/pages/MonthlyTeamReportPage";
import NotificationsPage from "@/pages/NotificationsPage";
import SettingsPage from "@/pages/SettingsPage";
import { ReportsIndexRedirect } from "@/components/ReportsHeader";
import { Navigate } from "react-router-dom";
import {
  IconHome,
  IconBoard,
  IconSitemap,
  IconChart,
  IconUsers,
  IconBuilding,
  IconSettings,
} from "@/components/icons";

const ALL_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"];

export interface AppRoute {
  /** Relative path, matching both the <Route path> and the sidebar NavLink "to" (under "/"). */
  path: string;
  /** Shown in the sidebar and used for the breadcrumb / access-denied message. */
  label: string;
  roles: Role[];
  element: JSX.Element;
  /** NavLink's `end` — required whenever another route's path extends this one (e.g. "reports/weekly/team"). */
  end?: boolean;
  /** Sidebar group title. Routes without one aren't shown in the sidebar (e.g. reached via a link elsewhere). */
  group?: string;
  /** Path of the route this one sits under. Only routes with a parent get a breadcrumb ("Tasks › Import from Excel"). */
  parent?: string;
  icon?: (className: string) => JSX.Element;
}

/**
 * Single source of truth for every route under the signed-in app shell: the path, which
 * roles may open it, its element, and (if it belongs in the sidebar) its label/icon/group.
 * The router wraps each in <RequireRole>, and Layout renders the sidebar from the same list,
 * so a role change can never make a page reachable without also making it navigable, or vice versa.
 */
export const APP_ROUTES: AppRoute[] = [
  { path: "", label: "Dashboard", roles: ALL_ROLES, end: true, group: "Work", icon: (c) => <IconHome className={c} />, element: <DashboardPage /> },
  { path: "tasks", label: "Tasks", roles: ALL_ROLES, group: "Work", icon: (c) => <IconBoard className={c} />, element: <TasksPage /> },
  { path: "tasks/import", label: "Import from Excel", parent: "tasks", roles: ["OWNER", "ADMIN"], element: <TaskImportPage /> },
  { path: "hierarchy", label: "Org Chart", roles: ALL_ROLES, group: "Work", icon: (c) => <IconSitemap className={c} />, element: <HierarchyPage /> },

  // One "Reports" item; the four report pages share a header with Weekly | Monthly and Me | My team.
  { path: "reports", label: "Reports", roles: ALL_ROLES, group: "Reports", icon: (c) => <IconChart className={c} />, element: <ReportsIndexRedirect /> },
  { path: "reports/weekly", label: "Reports: Weekly", roles: ALL_ROLES, end: true, element: <WeeklyReportPage /> },
  { path: "reports/weekly/team", label: "Reports: Team weekly", roles: ["OWNER", "ADMIN", "MANAGER"], element: <WeeklyTeamReportPage /> },
  { path: "reports/monthly", label: "Reports: Monthly", roles: ALL_ROLES, end: true, element: <MonthlyReportPage /> },
  { path: "reports/monthly/team", label: "Reports: Team monthly", roles: ["OWNER", "ADMIN", "MANAGER"], element: <MonthlyTeamReportPage /> },

  { path: "users", label: "Users", roles: ["OWNER", "ADMIN"], group: "Admin", icon: (c) => <IconUsers className={c} />, element: <UsersPage /> },
  { path: "organization", label: "Organization", roles: ["OWNER", "ADMIN"], group: "Admin", icon: (c) => <IconBuilding className={c} />, element: <OrganizationPage /> },
  { path: "settings", label: "Settings", roles: ["OWNER", "ADMIN"], group: "Admin", icon: (c) => <IconSettings className={c} />, element: <SettingsPage /> },
  // Old addresses keep working.
  { path: "centers", label: "Organization", roles: ["OWNER", "ADMIN"], element: <Navigate to="/organization" replace /> },
  { path: "departments", label: "Organization", roles: ["OWNER", "ADMIN"], element: <Navigate to="/organization?tab=departments" replace /> },

  { path: "notifications", label: "Notifications", roles: ALL_ROLES, element: <NotificationsPage /> },
];

export const NAV_GROUPS: { title: string; items: AppRoute[] }[] = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, AppRoute[]>();
  for (const route of APP_ROUTES) {
    if (!route.group) continue;
    if (!byGroup.has(route.group)) {
      order.push(route.group);
      byGroup.set(route.group, []);
    }
    byGroup.get(route.group)!.push(route);
  }
  return order.map((title) => ({ title, items: byGroup.get(title)! }));
})();

/** The route whose path best matches the current location — the longest match wins, so a
 * team-report page (e.g. "reports/weekly/team") doesn't fall back to its parent's label. */
export function matchRoute(pathname: string): AppRoute | undefined {
  const path = pathname.replace(/^\//, "");
  let best: AppRoute | undefined;
  for (const route of APP_ROUTES) {
    const matches = route.end ? path === route.path : path === route.path || path.startsWith(`${route.path}/`);
    if (matches && (!best || route.path.length > best.path.length)) best = route;
  }
  return best;
}
