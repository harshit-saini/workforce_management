import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import Avatar from "@/components/Avatar";
import {
  IconHome,
  IconBoard,
  IconSitemap,
  IconChart,
  IconUsers,
  IconBuilding,
  IconLayers,
  IconSettings,
  IconChevronsLeft,
  IconChevronsRight,
  IconMenu,
  IconX,
  IconLogOut,
} from "@/components/icons";

type NavItem = { to: string; label: string; roles: string[]; end?: boolean; icon: (className: string) => JSX.Element };
type NavGroup = { title: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    title: "Work",
    items: [
      { to: "/", label: "Dashboard", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"], end: true, icon: (c) => <IconHome className={c} /> },
      { to: "/tasks", label: "Tasks", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"], icon: (c) => <IconBoard className={c} /> },
      { to: "/hierarchy", label: "Org Chart", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"], icon: (c) => <IconSitemap className={c} /> },
    ],
  },
  {
    title: "Reports",
    items: [
      { to: "/reports/weekly", label: "Weekly Report", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"], icon: (c) => <IconChart className={c} /> },
      { to: "/reports/weekly/team", label: "Team Weekly", roles: ["OWNER", "ADMIN", "MANAGER"], icon: (c) => <IconChart className={c} /> },
      { to: "/reports/monthly", label: "Monthly Report", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"], icon: (c) => <IconChart className={c} /> },
      { to: "/reports/monthly/team", label: "Team Monthly", roles: ["OWNER", "ADMIN", "MANAGER"], icon: (c) => <IconChart className={c} /> },
    ],
  },
  {
    title: "Admin",
    items: [
      { to: "/users", label: "Users", roles: ["OWNER", "ADMIN"], icon: (c) => <IconUsers className={c} /> },
      { to: "/centers", label: "Centers", roles: ["OWNER", "ADMIN"], icon: (c) => <IconBuilding className={c} /> },
      { to: "/departments", label: "Departments", roles: ["OWNER", "ADMIN"], icon: (c) => <IconLayers className={c} /> },
      { to: "/settings", label: "Settings", roles: ["OWNER", "ADMIN"], icon: (c) => <IconSettings className={c} /> },
    ],
  },
];

const allItems = navGroups.flatMap((g) => g.items);

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "1");
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const currentLabel = allItems.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))?.label;

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          "fixed md:static inset-y-0 left-0 z-40 shrink-0 border-r border-gray-200 bg-white flex flex-col",
          "transform transition-[transform,width] duration-200 md:translate-x-0",
          collapsed ? "md:w-16" : "md:w-60",
          "w-60",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-14 px-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className={clsx("flex items-center gap-2 min-w-0", collapsed && "md:hidden")}>
            <span className="w-7 h-7 rounded-md bg-brand-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              W
            </span>
            <span className="font-semibold text-gray-800 truncate">Workforce Mgmt</span>
          </div>
          <span className={clsx("hidden", collapsed && "md:flex w-7 h-7 rounded-md bg-brand-600 text-white items-center justify-center font-bold text-sm mx-auto")}>
            W
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-gray-700 shrink-0"
            aria-label="Close menu"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => item.roles.includes(user.role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="mb-4">
                {!collapsed && (
                  <div className="px-4 mb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide md:block hidden">
                    {group.title}
                  </div>
                )}
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setSidebarOpen(false)}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      clsx(
                        "flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-1.5 rounded-md text-sm border-l-[3px]",
                        collapsed && "md:justify-center md:px-2",
                        isActive
                          ? "bg-brand-50 text-brand-700 font-medium border-brand-600"
                          : "text-gray-600 hover:bg-gray-50 border-transparent"
                      )
                    }
                  >
                    {item.icon("w-[18px] h-[18px] shrink-0")}
                    <span className={clsx(collapsed && "md:hidden", "truncate")}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex items-center gap-2 px-4 py-3 border-t border-gray-100 text-gray-400 hover:text-gray-700 hover:bg-gray-50 text-xs shrink-0"
        >
          {collapsed ? <IconChevronsRight className="w-4 h-4 mx-auto" /> : (
            <>
              <IconChevronsLeft className="w-4 h-4" /> Collapse
            </>
          )}
        </button>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 sm:px-6 gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-gray-500 hover:text-gray-800 shrink-0"
              aria-label="Open menu"
            >
              <IconMenu className="w-5 h-5" />
            </button>
            {currentLabel && (
              <div className="text-sm text-gray-400 truncate">
                Workspace <span className="mx-1">/</span> <span className="text-gray-700 font-medium">{currentLabel}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full hover:bg-gray-50 pr-1"
              >
                <Avatar name={user.name} size="sm" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-popover z-20 py-1">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-800 truncate">{user.name}</div>
                      <div className="text-xs text-gray-400 truncate">{user.email}</div>
                      <span className="inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        {user.role}
                      </span>
                    </div>
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 text-left text-sm text-gray-600 hover:bg-gray-50 px-3 py-2"
                    >
                      <IconLogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
