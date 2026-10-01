import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, addDays } from "date-fns";
import PeriodStepper from "@/components/PeriodStepper";
import { dayParam, parseDay, weekLabel, weekStartOf } from "@/lib/periods";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useUsersList } from "@/hooks/useLookups";
import { api } from "@/lib/api";
import { WeeklyReport } from "@/types";
import StatCard from "@/components/StatCard";
import ReportTaskList from "@/components/ReportTaskList";
import QueryError, { LoadingText } from "@/components/QueryError";
import { btnPrimary } from "@/lib/ui";

export default function WeeklyReportPage() {
  const [summary, setSummary] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // ?userId= lets managers open a team member's report from Team Weekly (read-only).
  const [params, setParams] = useSearchParams();
  const weekParam = params.get("week");
  const requestedUserId = params.get("userId");
  const viewingOther = !!requestedUserId && requestedUserId !== user?.id;
  const { data: users } = useUsersList();
  const subjectName = viewingOther ? users?.items.find((u) => u.id === requestedUserId)?.name ?? "Team member" : null;

  const reportQuery = useQuery({
    // With no ?week= the server opens your oldest past week that still needs submitting (else this week).
    queryKey: ["weekly-report", viewingOther ? requestedUserId : "self", weekParam ?? "default"],
    queryFn: async () => {
      const { data } = await api.get<WeeklyReport>("/reports/weekly", {
        params: { userId: viewingOther ? requestedUserId : undefined, week: weekParam ?? undefined },
      });
      setSummary(data.summary ?? "");
      return data;
    },
  });
  const report = reportQuery.data;

  const submit = useMutation({
    mutationFn: () => api.post(`/reports/weekly/${report!.id}/submit`, { summary }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-report"] }),
    meta: { successMessage: "Weekly report submitted", errorTitle: "Couldn't submit your report" },
  });

  if (!report) {
    return reportQuery.isError ? (
      <QueryError
        title={viewingOther ? "Couldn't load this weekly report" : "Couldn't load your weekly report"}
        error={reportQuery.error}
        onRetry={() => reportQuery.refetch()}
        retrying={reportQuery.isFetching}
      />
    ) : (
      <LoadingText />
    );
  }

  const weekStart = parseDay(report.weekStartDate);
  const currentWeekStart = weekStartOf(new Date());
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();
  const editable = report.status === "DRAFT" || report.status === "CHANGES_REQUESTED";
  const goToWeek = (d: Date) => {
    const next = new URLSearchParams(params);
    next.set("week", dayParam(d));
    setParams(next);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {viewingOther && (
        <Link to="/reports/weekly/team" className="text-xs text-brand-600 hover:underline">
          ← Team weekly reports
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            {subjectName ? `${subjectName}'s weekly report` : "Weekly Report"}
          </h1>
          <div className="text-xs text-subtle mt-0.5">Updated {formatDistanceToNow(new Date(report.updatedAt), { addSuffix: true })}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{report.status}</span>
          <PeriodStepper
            unit="week"
            label={weekLabel(weekStart)}
            onPrev={() => goToWeek(addDays(weekStart, -7))}
            onNext={() => goToWeek(addDays(weekStart, 7))}
            nextDisabled={weekStart >= currentWeekStart}
            onCurrent={isCurrentWeek ? undefined : () => goToWeek(currentWeekStart)}
          />
        </div>
      </div>
      {!viewingOther && editable && weekStart < currentWeekStart && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This report for {weekLabel(weekStart)} hasn't been submitted yet.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Completed" value={report.tasksCompleted} accent="#216e4e" />
        <StatCard label="Carried over" value={report.tasksCarriedOver} accent="#946f00" />
        <StatCard label="Blocked" value={report.tasksBlocked} accent="#ae2e24" />
        <StatCard label="Hours logged" value={report.hoursLogged.toFixed(1)} sub={`${report.daysLogged} days`} accent="#5e4db2" />
      </div>

      <ReportTaskList
        title={isCurrentWeek ? "Completed this week" : "Completed that week"}
        tasks={report.completedTasks}
        emptyLabel={isCurrentWeek ? "No tasks completed yet this week" : "No tasks completed this week"}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Summary / blockers / highlights</label>
        <textarea
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          rows={5}
          value={summary}
          disabled={viewingOther || (report.status !== "DRAFT" && report.status !== "CHANGES_REQUESTED")}
          onChange={(e) => setSummary(e.target.value)}
        />
        {!viewingOther && (report.status === "DRAFT" || report.status === "CHANGES_REQUESTED") && (
          <button onClick={() => submit.mutate()} disabled={submit.isPending} className={`mt-3 ${btnPrimary}`}>
            {submit.isPending ? "Submitting…" : "Submit report"}
          </button>
        )}
        {report.managerComment && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Manager feedback</div>
            <p className="text-sm text-gray-700">{report.managerComment}</p>
          </div>
        )}
      </div>
    </div>
  );
}
