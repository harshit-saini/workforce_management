import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import NotificationBell, { useBellNotifications } from "@/components/NotificationBell";
import { api } from "@/lib/api";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useSetup } from "@/hooks/useSetup";
import { usePopover } from "@/hooks/usePopover";
import { NavBadge, useNavBadges } from "@/hooks/useNavBadges";
import { Organization } from "@/types";
import Avatar from "@/components/Avatar";
import CommandPalette, { isMac, usePaletteHotkeys } from "@/components/CommandPalette";
import { APP_ROUTES, NAV_GROUPS, matchRoute } from "@/lib/routes";
import {
  IconChevronsLeft,
  IconChevronsRight,
  IconMenu,
  IconX,
  IconLogOut,
  IconSearch,
} from "@/components/icons";

const BADGE_BG = { red: "bg-red-600", blue: "bg-brand-600", amber: "bg-amber-500" } as const;

/** A count or dot at the end of a menu item (on a collapsed rail it moves onto the icon instead). */
function NavBadgeView({ badge, collapsed }: { badge: NavBadge; collapsed: boolean }) {
  return (
    <span title={badge.label} className={clsx("shrink-0", collapsed && "md:hidden")}>
      <span className="sr-only">{badge.label}</span>
      {badge.kind === "count" ? (
        <span aria-hidden="true" className={clsx("inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white", BADGE_BG[badge.tone])}>
          {badge.count! > 99 ? "99+" : badge.count}
        </span>
      ) : (
        <span aria-hidden="true" className={clsx("block h-2 w-2 rounded-full", BADGE_BG[badge.tone])} />
      )}
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar-collapsed") === "1");
  const { open: menuOpen, close: closeMenu, toggle: toggleMenu, triggerRef: avatarRef, panelRef: menuRef } = usePopover();
  const asideRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  usePaletteHotkeys(openPalette);
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // On a phone the sidebar is a slide-in menu. While it's closed it's off-screen, so it must not be reachable
  // with Tab or a screen reader; while it's open, Escape closes it and focus comes back to the menu button.
  const sidebarHidden = !isDesktop && !sidebarOpen;
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    if (sidebarHidden) el.setAttribute("inert", "");
    else el.removeAttribute("inert");
  }, [sidebarHidden]);
  useEffect(() => {
    if (isDesktop || !sidebarOpen) return;
    asideRef.current?.querySelector<HTMLElement>("nav a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        setSidebarOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen, isDesktop]);

  // Same key as the Settings page, so renaming the organization there updates this immediately.
  const { data: org } = useQuery({
    queryKey: ["organization"],
    queryFn: async () => (await api.get<Organization>("/settings/organization")).data,
    staleTime: 5 * 60_000,
    enabled: !!user,
  });
  const { data: bell } = useBellNotifications();
  const setup = useSetup();
  const badges = useNavBadges();
  const current = matchRoute(location.pathname);
  const unread = bell?.unreadCount ?? 0;
  usePageTitle(`${unread > 0 ? `(${unread}) ` : ""}${current ? current.label : "Page not found"}`, org?.name);

  if (!user) return null;

  const parentRoute = current?.parent ? APP_ROUTES.find((r) => r.path === current.parent) : undefined;

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
        ref={asideRef}
        aria-hidden={sidebarHidden || undefined}
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
            <div className="min-w-0 leading-tight">
              <div className="font-semibold text-gray-800 text-sm truncate">Workforce Mgmt</div>
              {org && (
                <div className="text-xs text-gray-500 truncate" title={org.name}>
                  {org.name}
                </div>
              )}
            </div>
          </div>
          <span className={clsx("hidden", collapsed && "md:flex w-7 h-7 rounded-md bg-brand-600 text-white items-center justify-center font-bold text-sm mx-auto")}>
            W
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden flex h-10 w-10 -mr-2 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 shrink-0"
            aria-label="Close menu"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {setup.active && (
            <Link
              to="/"
              onClick={() => setSidebarOpen(false)}
              title={collapsed ? `Setup ${setup.doneCount}/${setup.total}` : undefined}
              className={clsx(
                "mx-2 mb-3 flex items-center justify-between gap-2 rounded-md bg-brand-50 px-2.5 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100",
                collapsed && "md:justify-center md:px-1"
              )}
            >
              <span className={clsx(collapsed && "md:hidden")}>Setup</span>
              <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                {setup.doneCount}/{setup.total}
              </span>
            </Link>
          )}
          {NAV_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => item.roles.includes(user.role));
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="mb-4">
                {/* Headings show on the phone drawer too; only the collapsed desktop rail drops them. */}
                <div className={clsx("px-4 mb-1 text-[11px] font-semibold text-gray-600 uppercase tracking-wide", collapsed && "md:hidden")}>
                  {group.title}
                </div>
                {collapsed && <div className="hidden md:block mx-3 mb-1 border-t border-gray-100" aria-hidden="true" />}
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={`/${item.path}`}
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
                    <span className="relative shrink-0">
                      {item.icon!("w-[18px] h-[18px]")}
                      {badges[item.path] && (
                        <span
                          aria-hidden="true"
                          className={clsx(
                            "absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white",
                            collapsed ? "md:block" : "md:hidden",
                            "hidden",
                            BADGE_BG[badges[item.path]!.tone]
                          )}
                        />
                      )}
                    </span>
                    <span className={clsx(collapsed && "md:hidden", "truncate flex-1")}>{item.label}</span>
                    {badges[item.path] && <NavBadgeView badge={badges[item.path]!} collapsed={collapsed} />}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:flex items-center gap-2 px-4 py-3 border-t border-gray-100 text-subtle hover:text-gray-700 hover:bg-gray-50 text-xs shrink-0"
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
              ref={menuButtonRef}
              onClick={() => setSidebarOpen(true)}
              className="md:hidden flex h-10 w-10 -ml-2 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 shrink-0"
              aria-label="Open menu"
              aria-expanded={sidebarOpen}
            >
              <IconMenu className="w-5 h-5" />
            </button>
            {/* Only where there's real hierarchy: the page's own heading already says where you are. */}
            {current && parentRoute && (
              <nav aria-label="Breadcrumb" className="text-sm text-subtle truncate">
                <Link to={`/${parentRoute.path}`} className="hover:text-gray-700 hover:underline">
                  {parentRoute.label}
                </Link>
                <span className="mx-1.5" aria-hidden="true">
                  ›
                </span>
                <span className="text-gray-700 font-medium" aria-current="page">
                  {current.label}
                </span>
              </nav>
            )}
          </div>
          <button
            onClick={openPalette}
            className="hidden sm:flex flex-1 max-w-sm items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 hover:bg-white hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            aria-label="Search tasks, people and pages"
            aria-keyshortcuts="Control+K Meta+K /"
          >
            <IconSearch className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">Search tasks, people…</span>
            <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] text-gray-600">{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={openPalette}
              className="sm:hidden rounded-full p-2 text-gray-600 hover:bg-gray-100"
              aria-label="Search tasks, people and pages"
            >
              <IconSearch className="w-5 h-5" />
            </button>
            <NotificationBell />
            <div className="relative">
              <button
                ref={avatarRef}
                onClick={toggleMenu}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label={`Account menu for ${user.name}`}
                className="flex items-center gap-2 rounded-full hover:bg-gray-50 pr-1"
              >
                <Avatar name={user.name} size="sm" />
              </button>
              {menuOpen && (
                <>
                  <div ref={menuRef} className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-popover z-20 py-1">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-800 truncate">{user.name}</div>
                      <div className="text-xs text-subtle truncate">{user.email}</div>
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
        {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
