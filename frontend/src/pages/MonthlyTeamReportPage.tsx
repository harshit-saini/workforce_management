import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useCenters, useDepartments } from "@/hooks/useLookups";
import StatCard from "@/components/StatCard";
import PeriodStepper from "@/components/PeriodStepper";
import QueryError, { LoadingText } from "@/components/QueryError";
import { monthLabel, shiftMonth } from "@/lib/periods";
import { card } from "@/lib/ui";

interface Entry {
  user: { id: string; name: string };
  report: { completionRate: number; tasksPlanned: number; tasksCompleted: number; hoursLogged: number; hoursExpected: number };
}

interface TeamSummary {
  /** null when nobody on the team had anything planned. */
  avgCompletionRate: number | null;
  topPerformers: Entry[];
  atRisk: Entry[];
  all: Entry[];
  updatedAt: string | null;
}

const pct = (rate: number) => `${(rate * 100).toFixed(0)}%`;

export default function MonthlyTeamReportPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [params, setParams] = useSearchParams();
  const month = Math.min(12, Math.max(1, Number(params.get("month")) || currentMonth));
  const year = Number(params.get("year")) || currentYear;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const goToMonth = (target: { year: number; month: number }) => {
    const next = new URLSearchParams(params);
    next.set("year", String(target.year));
    next.set("month", String(target.month));
    setParams(next);
  };

  const [centerId, setCenterId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const { data: centers } = useCenters();
  const { data: departments } = useDepartments();

  const summaryQuery = useQuery({
    queryKey: ["monthly-team-summary", month, year, centerId, departmentId],
    queryFn: async () =>
      (
        await api.get<TeamSummary>("/reports/monthly/team-summary", {
          params: { month, year, centerId: centerId || undefined, departmentId: departmentId || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const { data } = summaryQuery;
  const reportLink = (userId: string) => `/reports/monthly?userId=${userId}&month=${month}&year=${year}`;
  const selectClass = "border border-gray-300 rounded-md px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Team Monthly Rollup</h1>
          {data?.updatedAt && (
            <div className="text-xs text-gray-400 mt-0.5">
              {isCurrentMonth ? "Month still in progress · " : ""}Updated {formatDistanceToNow(new Date(data.updatedAt), { addSuffix: true })}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodStepper
            unit="month"
            label={monthLabel(year, month)}
            onPrev={() => goToMonth(shiftMonth(year, month, -1))}
            onNext={() => goToMonth(shiftMonth(year, month, 1))}
            nextDisabled={year > currentYear || (year === currentYear && month >= currentMonth)}
            onCurrent={isCurrentMonth ? undefined : () => goToMonth({ year: currentYear, month: currentMonth })}
          />
          <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className={selectClass}>
            <option value="">All centers</option>
            {centers?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={selectClass}>
            <option value="">All departments</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!data &&
        (summaryQuery.isError ? (
          <QueryError
            title="Couldn't load the team rollup"
            error={summaryQuery.error}
            onRetry={() => summaryQuery.refetch()}
            retrying={summaryQuery.isFetching}
          />
        ) : (
          <LoadingText />
        ))}

      {data && (
        <>
          <StatCard
            label="Average completion rate"
            value={data.avgCompletionRate == null ? "—" : pct(data.avgCompletionRate)}
            sub={data.avgCompletionRate == null ? "No one on this team had tasks planned" : "Of people who had tasks planned"}
          />

          <div className="grid md:grid-cols-2 gap-4">
            <RankList title="Top performers" empty="No one has reached 50% yet" entries={data.topPerformers} link={reportLink} tone="text-green-700" />
            <RankList title="At-risk employees" empty="None — nice work team" entries={data.atRisk} link={reportLink} tone="text-red-600" />
          </div>

          <div className={`${card} overflow-x-auto`}>
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">Everyone ({data.all.length})</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-right px-4 py-2">Completed</th>
                  <th className="text-right px-4 py-2">Planned</th>
                  <th className="text-right px-4 py-2">Rate</th>
                  <th className="text-right px-4 py-2">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.all.map(({ user, report }) => (
                  <tr key={user.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <Link to={reportLink(user.id)} className="font-medium text-gray-800 hover:text-brand-700 hover:underline">
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right">{report.tasksCompleted}</td>
                    <td className="px-4 py-2 text-right">{report.tasksPlanned}</td>
                    <td className="px-4 py-2 text-right" title={report.tasksPlanned === 0 ? "No tasks planned this month" : undefined}>
                      {report.tasksPlanned === 0 ? "—" : pct(report.completionRate)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {report.hoursLogged.toFixed(1)} / {report.hoursExpected}
                    </td>
                  </tr>
                ))}
                {data.all.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                      No team members found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function RankList({
  title,
  empty,
  entries,
  link,
  tone,
}: {
  title: string;
  empty: string;
  entries: Entry[];
  link: (userId: string) => string;
  tone: string;
}) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      {entries.length === 0 && <div className="text-xs text-gray-400">{empty}</div>}
      {entries.map((p) => (
        <div key={p.user.id} className="flex justify-between text-sm py-1">
          <Link to={link(p.user.id)} className="hover:text-brand-700 hover:underline">
            {p.user.name}
          </Link>
          <span className={tone}>{pct(p.report.completionRate)}</span>
        </div>
      ))}
    </div>
  );
}
