import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { WeeklyReport } from "@/types";
import StatCard from "@/components/StatCard";
import ReportTaskList from "@/components/ReportTaskList";
import QueryError, { LoadingText } from "@/components/QueryError";
import { btnPrimary } from "@/lib/ui";

export default function WeeklyReportPage() {
  const [summary, setSummary] = useState("");
  const queryClient = useQueryClient();

  const reportQuery = useQuery({
    queryKey: ["weekly-report", "self"],
    queryFn: async () => {
      const { data } = await api.get<WeeklyReport>("/reports/weekly");
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
        title="Couldn't load your weekly report"
        error={reportQuery.error}
        onRetry={() => reportQuery.refetch()}
        retrying={reportQuery.isFetching}
      />
    ) : (
      <LoadingText />
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">
          Weekly Report — {format(new Date(report.weekStartDate), "MMM d")} to {format(new Date(report.weekEndDate), "MMM d")}
        </h1>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{report.status}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Completed" value={report.tasksCompleted} accent="#216e4e" />
        <StatCard label="Carried over" value={report.tasksCarriedOver} accent="#946f00" />
        <StatCard label="Blocked" value={report.tasksBlocked} accent="#ae2e24" />
        <StatCard label="Hours logged" value={report.hoursLogged.toFixed(1)} sub={`${report.daysLogged} days`} accent="#5e4db2" />
      </div>

      <ReportTaskList
        title="Completed this week"
        tasks={report.completedTasks}
        emptyLabel="No tasks completed yet this week"
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
          disabled={report.status !== "DRAFT" && report.status !== "CHANGES_REQUESTED"}
          onChange={(e) => setSummary(e.target.value)}
        />
        {(report.status === "DRAFT" || report.status === "CHANGES_REQUESTED") && (
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
