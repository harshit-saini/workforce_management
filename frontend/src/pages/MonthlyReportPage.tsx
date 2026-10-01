import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, formatDistanceToNow } from "date-fns";
import PeriodStepper from "@/components/PeriodStepper";
import { monthLabel, shiftMonth } from "@/lib/periods";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useUsersList } from "@/hooks/useLookups";
import { api } from "@/lib/api";
import { MonthlyReport } from "@/types";
import StatCard from "@/components/StatCard";
import ReportTaskList from "@/components/ReportTaskList";
import QueryError, { LoadingText } from "@/components/QueryError";

export default function MonthlyReportPage() {
  const now = new Date();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  // ?userId= (plus optional month/year) lets managers open a team member's report from Team Monthly.
  const requestedUserId = params.get("userId");
  const viewingOther = !!requestedUserId && requestedUserId !== user?.id;
  const { data: users } = useUsersList();
  const subjectName = viewingOther ? users?.items.find((u) => u.id === requestedUserId)?.name ?? "Team member" : null;
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const month = Math.min(12, Math.max(1, Number(params.get("month")) || currentMonth));
  const year = Number(params.get("year")) || currentYear;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const goToMonth = (target: { year: number; month: number }) => {
    const next = new URLSearchParams(params);
    next.set("year", String(target.year));
    next.set("month", String(target.month));
    setParams(next);
  };

  const reportQuery = useQuery({
    queryKey: ["monthly-report", viewingOther ? requestedUserId : "self", month, year],
    queryFn: async () =>
      (
        await api.get<MonthlyReport>("/reports/monthly", {
          params: { month, year, userId: viewingOther ? requestedUserId : undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;

  return (
    <div className="space-y-4 max-w-3xl">
      {viewingOther && (
        <Link to={`/reports/monthly/team?year=${year}&month=${month}`} className="text-xs text-brand-600 hover:underline">
          ← Team monthly rollup
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{subjectName ? `${subjectName}'s monthly report` : "Monthly Report"}</h1>
          {report && (
            <div className="text-xs text-subtle mt-0.5">
              {isCurrentMonth || new Date(report.generatedAt) < new Date(year, month, 1) ? "Month still in progress · " : ""}
              Updated {formatDistanceToNow(new Date(report.generatedAt), { addSuffix: true })}
            </div>
          )}
        </div>
        <PeriodStepper
          unit="month"
          label={monthLabel(year, month)}
          onPrev={() => goToMonth(shiftMonth(year, month, -1))}
          onNext={() => goToMonth(shiftMonth(year, month, 1))}
          nextDisabled={year > currentYear || (year === currentYear && month >= currentMonth)}
          onCurrent={isCurrentMonth ? undefined : () => goToMonth({ year: currentYear, month: currentMonth })}
        />
      </div>

      {!report &&
        (reportQuery.isError ? (
          <QueryError
            title={viewingOther ? "Couldn't load this monthly report" : "Couldn't load your monthly report"}
            error={reportQuery.error}
            onRetry={() => reportQuery.refetch()}
            retrying={reportQuery.isFetching}
          />
        ) : (
          <LoadingText />
        ))}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Completion rate" value={`${(report.completionRate * 100).toFixed(0)}%`} accent="#0c66e4" />
            <StatCard label="Tasks completed" value={report.tasksCompleted} sub={`of ${report.tasksPlanned} planned`} accent="#216e4e" />
            <StatCard label="Hours logged" value={report.hoursLogged.toFixed(1)} sub={`of ${report.hoursExpected} expected`} accent="#5e4db2" />
            <StatCard label="Days logged" value={report.daysLogged} accent="#946f00" />
          </div>

          <ReportTaskList
            title="Completed this month"
            tasks={report.completedTasks}
            emptyLabel="No tasks completed yet this month"
            dateField="completedAt"
          />
          <ReportTaskList
            title="Overdue"
            tasks={report.overdueTasks}
            emptyLabel="Nothing overdue"
            dateField="dueDate"
            overdue
          />

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Weekly completion trend</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={report.weeklyBreakdownJson ?? []}>
                <XAxis dataKey="weekStartDate" tickFormatter={(d) => format(new Date(d), "MMM d")} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip labelFormatter={(d) => format(new Date(d), "MMM d, yyyy")} />
                <Line type="monotone" dataKey="tasksCompleted" stroke="#3182f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {report.topBlockersJson && report.topBlockersJson.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="text-sm font-medium text-gray-700 mb-2">Recurring themes</div>
              <div className="flex flex-wrap gap-2">
                {report.topBlockersJson.map((b) => (
                  <span key={b.word} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {b.word} ({b.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
