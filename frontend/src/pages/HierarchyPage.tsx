import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { HierarchyNode } from "@/types";
import { useCenters, useDepartments } from "@/hooks/useLookups";
import OrgChartNode from "@/components/OrgChartNode";

function flatten(nodes: HierarchyNode[]): HierarchyNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.reports)]);
}

export default function HierarchyPage() {
  const [search, setSearch] = useState("");
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [highlightId, setHighlightId] = useState<string | undefined>();

  const { data: tree } = useQuery({
    queryKey: ["hierarchy-tree"],
    queryFn: async () => (await api.get<HierarchyNode[]>("/hierarchy/tree")).data,
  });
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();

  const allNodes = useMemo(() => (tree ? flatten(tree) : []), [tree]);

  function matchesFilter(node: HierarchyNode) {
    if (centerId && node.centerId !== centerId) return false;
    if (departmentId && node.departmentId !== departmentId) return false;
    return true;
  }

  function jumpTo(name: string) {
    const match = allNodes.find((n) => n.name.toLowerCase().includes(name.toLowerCase()));
    if (match) {
      setHighlightId(match.id);
      document.getElementById(`org-node-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Org Chart</h1>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && jumpTo(search)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-56"
        />
        <button onClick={() => jumpTo(search)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
          Jump to
        </button>
        <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">All centers</option>
          {centers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
          <option value="">All departments</option>
          {departments?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 overflow-x-auto">
        {tree?.map((root) => (
          <OrgChartNode key={root.id} node={root} highlightId={highlightId} matchesFilter={matchesFilter} />
        ))}
        {tree?.length === 0 && <div className="text-sm text-gray-400">No users yet</div>}
      </div>
    </div>
  );
}
