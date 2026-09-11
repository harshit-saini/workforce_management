import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { WeeklyReport } from "@/types";
import StatCard from "@/components/StatCard";

export default function WeeklyReportPage() {
  const [summary, setSummary] = useState("");
  const queryClient = useQueryClient();

  const { data: report } = useQuery({
    queryKey: ["weekly-report", "self"],
    queryFn: async () => {
      const { data } = await api.get<WeeklyReport>("/reports/weekly");
      setSummary(data.summary ?? "");
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: () => api.post(`/reports/weekly/${report!.id}/submit`, { summary }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-report"] }),
  });

  if (!report) return <div className="text-gray-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">
          Weekly Report — {format(new Date(report.weekStartDate), "MMM d")} to {format(new Date(report.weekEndDate), "MMM d")}
        </h1>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">{report.status}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Completed" value={report.tasksCompleted} />
        <StatCard label="Carried over" value={report.tasksCarriedOver} />
        <StatCard label="Blocked" value={report.tasksBlocked} />
        <StatCard label="Hours logged" value={report.hoursLogged.toFixed(1)} sub={`${report.daysLogged} days`} />
      </div>

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
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="mt-3 bg-brand-600 text-white text-sm px-4 py-2 rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            Submit report
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
