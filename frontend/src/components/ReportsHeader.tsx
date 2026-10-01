import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";

export type ReportKind = "weekly" | "monthly";
export type ReportScope = "me" | "team";

const LAST_KEY = "reports-last";

export const reportPath = (kind: ReportKind, scope: ReportScope) => `/reports/${kind}${scope === "team" ? "/team" : ""}`;

function Segment({ items, label }: { items: { to: string; text: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg bg-gray-100 p-0.5">
      {items.map((item) => (
        <Link
          key={item.text}
          to={item.to}
          aria-current={item.active ? "page" : undefined}
          className={clsx(
            "px-3 py-1 text-sm rounded-md font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500",
            item.active ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
          )}
        >
          {item.text}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The top of every report page: one "Reports" heading with Weekly | Monthly and, for people who
 * review others, Me | My team. It replaces four separate sidebar items.
 */
export default function ReportsHeader({ kind, scope }: { kind: ReportKind; scope: ReportScope }) {
  const { user } = useAuth();
  const canSeeTeam = !!user && user.role !== "EMPLOYEE";

  useEffect(() => {
    localStorage.setItem(LAST_KEY, `${kind}:${scope}`);
  }, [kind, scope]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className="text-lg font-semibold text-gray-900">Reports</h1>
      <Segment
        label="Report period"
        items={[
          { to: reportPath("weekly", scope), text: "Weekly", active: kind === "weekly" },
          { to: reportPath("monthly", scope), text: "Monthly", active: kind === "monthly" },
        ]}
      />
      {canSeeTeam && (
        <Segment
          label="Whose reports"
          items={[
            { to: reportPath(kind, "me"), text: "Me", active: scope === "me" },
            { to: reportPath(kind, "team"), text: "My team", active: scope === "team" },
          ]}
        />
      )}
    </div>
  );
}

/** /reports opens wherever this person was last (or this week's report the first time). */
export function ReportsIndexRedirect() {
  const { user } = useAuth();
  const [kind, scope] = (localStorage.getItem(LAST_KEY) ?? "weekly:me").split(":") as [ReportKind, ReportScope];
  const safeScope = scope === "team" && user?.role !== "EMPLOYEE" ? "team" : "me";
  const safeKind = kind === "monthly" ? "monthly" : "weekly";
  return <Navigate to={reportPath(safeKind, safeScope)} replace />;
}
