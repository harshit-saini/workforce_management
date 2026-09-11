import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useCenters, useDepartments } from "@/hooks/useLookups";
import StatCard from "@/components/StatCard";

interface TeamSummary {
  avgCompletionRate: number;
  topPerformers: { user: { id: string; name: string }; report: { completionRate: number } }[];
  atRisk: { user: { id: string; name: string }; report: { completionRate: number } }[];
  all: { user: { id: string; name: string }; report: { completionRate: number; tasksCompleted: number; hoursLogged: number } }[];
}

export default function MonthlyTeamReportPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();

  const { data } = useQuery({
    queryKey: ["monthly-team-summary", month, year, centerId, departmentId],
    queryFn: async () =>
      (
        await api.get<TeamSummary>("/reports/monthly/team-summary", {
          params: { month, year, centerId: centerId || undefined, departmentId: departmentId || undefined },
        })
      ).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold text-gray-900">Team Monthly Rollup</h1>
        <div className="flex gap-2">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {format(new Date(2000, m - 1, 1), "MMMM")}
              </option>
            ))}
          </select>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-24" />
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
      </div>

      {data && (
        <>
          <StatCard label="Average completion rate" value={`${(data.avgCompletionRate * 100).toFixed(0)}%`} />

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Top performers</div>
              {data.topPerformers.map((p) => (
                <div key={p.user.id} className="flex justify-between text-sm py-1">
                  <span>{p.user.name}</span>
                  <span className="text-gray-500">{(p.report.completionRate * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">At-risk employees</div>
              {data.atRisk.length === 0 && <div className="text-xs text-gray-400">None — nice work team</div>}
              {data.atRisk.map((p) => (
                <div key={p.user.id} className="flex justify-between text-sm py-1">
                  <span>{p.user.name}</span>
                  <span className="text-red-500">{(p.report.completionRate * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
