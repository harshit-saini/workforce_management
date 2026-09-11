import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { OverviewResult } from "@/types";
import DateRangePicker, { RangeValue } from "@/components/DateRangePicker";
import StatCard from "@/components/StatCard";
import { useAuth } from "@/context/AuthContext";
import { useCenters, useDepartments } from "@/hooks/useLookups";

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeValue>({ preset: "this_week" });
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();

  const { data, isLoading } = useQuery({
    queryKey: ["overview", range, centerId, departmentId],
    queryFn: async () => {
      const params: Record<string, string> = { preset: range.preset };
      if (range.preset === "custom") {
        params.startDate = range.startDate ?? "";
        params.endDate = range.endDate ?? "";
      }
      if (centerId) params.centerId = centerId;
      if (departmentId) params.departmentId = departmentId;
      const { data } = await api.get<OverviewResult>("/overview", { params });
      return data;
    },
    enabled: range.preset !== "custom" || !!(range.startDate && range.endDate),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">Overview</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {isAdmin && (
        <div className="flex gap-3">
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
      )}

      {isLoading || !data ? (
        <div className="text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Tasks created" value={data.tasksCreated} />
            <StatCard label="Tasks completed" value={data.tasksCompleted} />
            <StatCard label="Still open" value={data.tasksOpen} />
            <StatCard label="Blocked" value={data.tasksBlocked} />
            <StatCard label="Hours logged" value={data.hoursLoggedTotal.toFixed(1)} />
            <StatCard
              label="Subtasks done"
              value={`${data.subtaskCompletion.done}/${data.subtaskCompletion.total}`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Hours logged by day</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.hoursByDay}>
                  <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d), "MMM d")} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip labelFormatter={(d) => format(new Date(d), "MMM d, yyyy")} />
                  <Bar dataKey="hours" fill="#3182f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Activity timeline</div>
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                {data.activityTimeline.length === 0 && <div className="text-sm text-gray-400 py-4">No activity in this range</div>}
                {data.activityTimeline.map((a) => (
                  <div key={a.id} className="py-2 text-sm">
                    <div className="text-gray-800">
                      <span className="font-medium">{a.userName}</span> — {a.message}
                    </div>
                    <div className="text-xs text-gray-400">
                      {a.taskTitle} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
