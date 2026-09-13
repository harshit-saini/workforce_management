import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { to: "/", label: "Dashboard", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"], end: true },
  { to: "/tasks", label: "Tasks", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"] },
  { to: "/hierarchy", label: "Org Chart", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"] },
  { to: "/reports/weekly", label: "Weekly Report", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"] },
  { to: "/reports/weekly/team", label: "Team Weekly", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { to: "/reports/monthly", label: "Monthly Report", roles: ["OWNER", "ADMIN", "MANAGER", "EMPLOYEE"] },
  { to: "/reports/monthly/team", label: "Team Monthly", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { to: "/users", label: "Users", roles: ["OWNER", "ADMIN"] },
  { to: "/centers", label: "Centers", roles: ["OWNER", "ADMIN"] },
  { to: "/departments", label: "Departments", roles: ["OWNER", "ADMIN"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (!user) return null;

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
          "fixed md:static inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col",
          "transform transition-transform duration-200 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="font-semibold text-brand-700">Workforce Mgmt</div>
            <div className="text-xs text-gray-400 truncate">{user.email}</div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "block px-4 py-2 text-sm rounded-md mx-2",
                    isActive ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-600 hover:bg-gray-50"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full text-sm text-gray-500 hover:text-gray-800 py-2 rounded-md hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between md:justify-end px-4 sm:px-6 gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-500 hover:text-gray-800 text-xl leading-none"
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="flex items-center gap-4">
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">{user.role}</span>
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
