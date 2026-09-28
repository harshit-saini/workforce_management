import { Link } from "react-router-dom";
import clsx from "clsx";
import { card } from "@/lib/ui";
import { IconChevronsRight } from "@/components/icons";

export default function StatCard({
  label,
  value,
  sub,
  accent = "#0c66e4",
  to,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  /** When set, the whole tile links to the matching list (e.g. Blocked → the blocked tasks). */
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
        {to && <IconChevronsRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 transition-colors" />}
      </div>
      <div className="text-2xl font-semibold text-gray-900 mt-1.5">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </>
  );
  const className = clsx(card, "p-4 border-l-[3px] block");

  if (to) {
    return (
      <Link
        to={to}
        className={clsx(className, "group hover:border-brand-400 hover:shadow-popover transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500")}
        style={{ borderLeftColor: accent }}
        aria-label={`${label}: ${value}. View these tasks`}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={className} style={{ borderLeftColor: accent }}>
      {body}
    </div>
  );
}
