import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { OverviewResult } from "@/types";
import DateRangePicker, { RangePreset, RangeValue } from "@/components/DateRangePicker";
import StatCard from "@/components/StatCard";
import Delta from "@/components/Delta";
import ChartCard from "@/components/ChartCard";
import AssignedToYou from "@/components/AssignedToYou";
import QueryError, { LoadingText } from "@/components/QueryError";
import GettingStarted from "@/components/GettingStarted";
import { useSetup } from "@/hooks/useSetup";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { OPEN_CATEGORIES, taskHref, tasksHref } from "@/lib/links";
import { CHART_COLORS } from "@/lib/chartColors";
import { parseDay } from "@/lib/periods";
import { card, filterControl } from "@/lib/ui";
import { useCenters, useDepartments } from "@/hooks/useLookups";

const DEFAULT_RANGE: RangeValue = { preset: "last_7_days" };
const PRESET_LABEL: Record<RangePreset, string> = {
  last_7_days: "Last 7 days",
  this_week: "This week",
  last_week: "Last week",
  last_2_weeks: "Last 2 weeks",
  custom: "Custom range",
};

/** The range someone last picked is theirs to keep; it comes back the next time they open the dashboard. */
function useRememberedRange(userId: string | undefined) {
  const key = userId ? `dashboard-range:${userId}` : null;
  const [range, setRangeState] = useState<RangeValue>(DEFAULT_RANGE);
  useEffect(() => {
    if (!key) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as RangeValue | null;
      if (saved && saved.preset in PRESET_LABEL) setRangeState(saved);
    } catch {
      /* a bad saved value just means the default */
    }
  }, [key]);
  const setRange = (next: RangeValue) => {
    setRangeState(next);
    if (key) localStorage.setItem(key, JSON.stringify(next));
  };
  return [range, setRange] as const;
}

const shortDay = (iso: string) => format(parseDay(iso.slice(0, 10)), "MMM d");

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useRememberedRange(user?.id);
  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();
  const rangeReady = range.preset !== "custom" || !!(range.startDate && range.endDate);

  const overviewQuery = useQuery({
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
    enabled: rangeReady,
    placeholderData: keepPreviousData,
  });
  const { data } = overviewQuery;
  // Before the first task there is nothing to measure: six zeros would only bury the checklist.
  const { noTasksYet } = useSetup();

  const periodLabel = data ? `${shortDay(data.range.startDate)} – ${shortDay(data.range.endDate)}` : "";
  const rangeName = range.preset === "custom" ? periodLabel || "Custom range" : PRESET_LABEL[range.preset];
  const filterLinks = { center: centerId, department: departmentId };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        {!noTasksYet && <DateRangePicker value={range} onChange={setRange} />}
      </div>

      {isAdmin && <GettingStarted />}

      {!noTasksYet && (
        <>
          {data && (
            <p className="text-sm text-gray-800" data-testid="dashboard-summary">
              <span className="font-semibold">{rangeName}:</span>{" "}
              {data.tasksCreated === 0 ? "no new tasks" : `${data.createdDone} of ${data.tasksCreated} new ${data.tasksCreated === 1 ? "task" : "tasks"} done`}
              {" · "}
              {data.tasksBlocked} blocked · {data.tasksOverdue} overdue
            </p>
          )}

          <AssignedToYou />

          {isAdmin && ((centers?.length ?? 0) > 0 || (departments?.length ?? 0) > 0) && (
            <div className="flex gap-3">
              {(centers?.length ?? 0) > 0 && (
                <select aria-label="Center" value={centerId} onChange={(e) => setCenterId(e.target.value)} className={filterControl(!!centerId)}>
                  <option value="">All centers</option>
                  {centers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {(departments?.length ?? 0) > 0 && (
                <select aria-label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={filterControl(!!departmentId)}>
                  <option value="">All departments</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </>
      )}

      {noTasksYet ? null : !data ? (
        overviewQuery.isError ? (
          <QueryError
            title="Couldn't load the overview"
            error={overviewQuery.error}
            onRetry={() => overviewQuery.refetch()}
            retrying={overviewQuery.isFetching}
          />
        ) : !rangeReady ? (
          <LoadingText label="Pick a start and end date to see the overview." />
        ) : (
          <LoadingText />
        )
      ) : (
        <>
          <section aria-labelledby="period-heading">
            <h2 id="period-heading" className="text-sm font-semibold text-gray-800 mb-2">
              In this period <span className="font-normal text-gray-600">· {periodLabel}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Tasks created"
                value={data.tasksCreated}
                accent="#0c66e4"
                sub={<Delta now={data.tasksCreated} before={data.previous.tasksCreated} label={data.previous.label} />}
              />
              <StatCard
                label="Tasks completed"
                value={data.tasksCompleted}
                accent="#216e4e"
                sub={<Delta now={data.tasksCompleted} before={data.previous.tasksCompleted} label={data.previous.label} />}
              />
              <StatCard
                label="Hours logged"
                value={`${data.hoursLoggedTotal.toFixed(1)}h`}
                accent="#5e4db2"
                sub={<Delta now={data.hoursLoggedTotal} before={data.previous.hoursLogged} label={data.previous.label} unit="h" digits={1} />}
              />
            </div>
          </section>

          <section aria-labelledby="now-heading">
            <h2 id="now-heading" className="text-sm font-semibold text-gray-800 mb-2">
              Right now <span className="font-normal text-gray-600">· as of today</span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Open"
                value={data.tasksOpen}
                accent="#946f00"
                to={tasksHref({ view: "list", subtasks: "1", category: OPEN_CATEGORIES, ...filterLinks })}
                sub={<Delta now={data.tasksOpen} before={data.previous.tasksOpen} label={data.previous.label} goodWhen="down" />}
              />
              <StatCard
                label="Overdue"
                value={data.tasksOverdue}
                accent="#ae2e24"
                to={tasksHref({ view: "list", subtasks: "1", due: "overdue", ...filterLinks })}
                sub={<Delta now={data.tasksOverdue} before={data.previous.tasksOverdue} label={data.previous.label} goodWhen="down" />}
              />
              <StatCard
                label="Blocked"
                value={data.tasksBlocked}
                accent="#ae2e24"
                to={tasksHref({ view: "list", subtasks: "1", category: "BLOCKED", ...filterLinks })}
              />
              <StatCard label="Subtasks done" value={`${data.subtaskCompletion.done}/${data.subtaskCompletion.total}`} sub="All time" accent="#0c66e4" />
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title="Hours logged per day"
              subtitle={`${periodLabel} · ${data.hoursLoggedTotal.toFixed(1)}h in total`}
              empty={
                data.hoursLoggedTotal === 0
                  ? {
                      title: "No hours logged in this range",
                      description: "Hours appear here as people log time on their tasks.",
                      action: { label: "Log time on a task", to: "/tasks" },
                    }
                  : undefined
              }
            >
              <div role="img" aria-label={hoursSummary(data.hoursPerDay)}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.hoursPerDay} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => format(parseDay(d), data.hoursPerDay.length > 8 ? "d" : "EEE d")}
                      fontSize={12}
                      stroke={CHART_COLORS.axis}
                      interval={data.hoursPerDay.length > 16 ? "preserveStartEnd" : 0}
                    />
                    <YAxis fontSize={12} stroke={CHART_COLORS.axis} allowDecimals={false} tickFormatter={(v: number) => `${v}h`} />
                    <Tooltip
                      labelFormatter={(d: string) => format(parseDay(d), "EEE, MMM d")}
                      formatter={(v: number) => [`${v}h`, "Hours logged"]}
                    />
                    <Bar dataKey="hours" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <div className={`${card} p-4`}>
              <h2 className="text-sm font-medium text-gray-700 mb-2">Activity timeline</h2>
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-50">
                {data.activityTimeline.length === 0 && <div className="text-sm text-subtle py-4">No activity in this range</div>}
                {data.activityTimeline.map((a) => (
                  <Link
                    key={a.id}
                    to={taskHref(a.taskId)}
                    className="block py-2 px-2 -mx-2 rounded-md text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <div className="text-gray-800">
                      <span className="font-medium">{a.userName}</span> — {a.message}
                    </div>
                    <div className="text-xs text-subtle">
                      <span className="text-brand-700">{a.taskTitle}</span> ·{" "}
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** A sentence for screen readers in place of the picture of bars. */
function hoursSummary(days: { date: string; hours: number }[]): string {
  const total = days.reduce((n, d) => n + d.hours, 0);
  const busiest = days.reduce((best, d) => (d.hours > best.hours ? d : best), days[0] ?? { date: "", hours: 0 });
  if (!days.length || total === 0) return "No hours logged.";
  return `Hours logged per day: ${total.toFixed(1)} hours in total over ${days.length} days; busiest day ${format(parseDay(busiest.date), "MMM d")} with ${busiest.hours} hours.`;
}
