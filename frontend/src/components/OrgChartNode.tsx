import { useState } from "react";
import clsx from "clsx";
import { HierarchyNode } from "@/types";

interface Props {
  node: HierarchyNode;
  highlightId?: string;
  matchesFilter: (node: HierarchyNode) => boolean;
}

export default function OrgChartNode({ node, highlightId, matchesFilter }: Props) {
  const [expanded, setExpanded] = useState(true);
  const isHighlighted = node.id === highlightId;
  const dimmed = !matchesFilter(node);

  return (
    <div className="pl-4 border-l border-gray-200">
      <div
        id={`org-node-${node.id}`}
        className={clsx(
          "flex items-center gap-2 py-1.5 px-2 rounded-md my-0.5",
          isHighlighted && "ring-2 ring-brand-500",
          dimmed ? "opacity-30" : "opacity-100"
        )}
      >
        {node.reports.length > 0 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-400 text-xs w-4">
            {expanded ? "▾" : "▸"}
          </button>
        )}
        {node.reports.length === 0 && <span className="w-4" />}
        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs flex items-center justify-center font-medium">
          {node.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-800">{node.name}</div>
          <div className="text-xs text-gray-400">
            {node.title ?? node.role} {node.status !== "ACTIVE" && `· ${node.status}`}
          </div>
        </div>
      </div>
      {expanded && node.reports.length > 0 && (
        <div className="ml-2">
          {node.reports.map((child) => (
            <OrgChartNode key={child.id} node={child} highlightId={highlightId} matchesFilter={matchesFilter} />
          ))}
        </div>
      )}
    </div>
  );
}
