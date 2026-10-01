import { ReactNode } from "react";
import { card } from "@/lib/ui";
import EmptyState, { EmptyAction } from "@/components/EmptyState";
import { IconChart } from "@/components/icons";

/**
 * The frame every chart sits in: a title, the chart itself, and — when there's nothing to plot —
 * a plain sentence about why and what to do, instead of an empty axis.
 */
export default function ChartCard({
  title,
  subtitle,
  empty,
  height = 220,
  children,
}: {
  title: string;
  subtitle?: string;
  /** When set the chart is replaced by this message. */
  empty?: { title: string; description?: string; action?: EmptyAction };
  height?: number;
  children: ReactNode;
}) {
  return (
    <div className={`${card} p-4`}>
      <div className="mb-2">
        <h2 className="text-sm font-medium text-gray-700">{title}</h2>
        {subtitle && <p className="text-xs text-gray-600">{subtitle}</p>}
      </div>
      {empty ? (
        <div className="flex items-center" style={{ height }}>
          <EmptyState bare icon={<IconChart />} title={empty.title} description={empty.description} primary={empty.action} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
