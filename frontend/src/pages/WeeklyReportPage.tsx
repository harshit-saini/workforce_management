import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import PeriodStepper from "@/components/PeriodStepper";
import { dayParam, parseDay, weekLabel, weekStartOf } from "@/lib/periods";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useUsersList } from "@/hooks/useLookups";
import { useSummaryAutosave } from "@/hooks/useAutosave";
import { api } from "@/lib/api";
import { WeeklyReport } from "@/types";
import StatCard from "@/components/StatCard";
import ReportTaskList from "@/components/ReportTaskList";
import ReportTracker from "@/components/ReportTracker";
import QueryError, { LoadingText } from "@/components/QueryError";
import { IconAlertCircle, IconCheck } from "@/components/icons";
import { btnPrimary, card } from "@/lib/ui";

export default function WeeklyReportPage() {
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
    queryFn: async () =>
      (
        await api.get<WeeklyReport>("/reports/weekly", {
          params: { userId: viewingOther ? requestedUserId : undefined, week: weekParam ?? undefined },
        })
      ).data,
  });
  const report = reportQuery.data;

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
  const goToWeek = (d: Date) => {
    const next = new URLSearchParams(params);
    next.set("week", dayParam(d));
    setParams(next);
  };

  // Keyed by report so switching weeks starts a fresh editor (and saves what was typed in the last one).
  return (
    <ReportView
      key={report.id}
      report={report}
      viewingOther={viewingOther}
      subjectName={subjectName}
      weekStart={weekStart}
      currentWeekStart={currentWeekStart}
      goToWeek={goToWeek}
    />
  );
}

function ReportView({
  report,
  viewingOther,
  subjectName,
  weekStart,
  currentWeekStart,
  goToWeek,
}: {
  report: WeeklyReport;
  viewingOther: boolean;
  subjectName: string | null;
  weekStart: Date;
  currentWeekStart: Date;
  goToWeek: (d: Date) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: users } = useUsersList();
  const managerName = users?.items.find((u) => u.id === user?.id)?.manager?.name;
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();
  const editable = !viewingOther && (report.status === "DRAFT" || report.status === "CHANGES_REQUESTED");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const autosave = useSummaryAutosave(report.id, report.summary ?? "", editable);

  const submit = useMutation({
    mutationFn: async () => {
      // Whatever is still unsaved goes with the submission, and a failed save stops it.
      if (!(await autosave.flush())) throw new Error("Your latest changes couldn't be saved");
      return api.post(`/reports/weekly/${report.id}/submit`, { summary: autosave.latest.current });
    },
    onSuccess: () => {
      setJustSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["weekly-report"] });
    },
    meta: { successMessage: "Weekly report submitted", errorTitle: "Couldn't submit your report" },
  });

  const statusBadge =
    report.status === "CHANGES_REQUESTED"
      ? { text: "Changes requested", cls: "bg-amber-50 text-amber-900 ring-amber-200" }
      : report.status === "APPROVED"
        ? { text: "Approved", cls: "bg-green-50 text-green-800 ring-green-200" }
        : report.status === "SUBMITTED"
          ? { text: "Submitted", cls: "bg-blue-50 text-blue-800 ring-blue-200" }
          : { text: "Draft", cls: "bg-gray-100 text-gray-700 ring-gray-200" };

  return (
    <div className="space-y-4 max-w-2xl">
      {viewingOther && (
        <Link to="/reports/weekly/team" className="text-xs text-brand-600 hover:underline">
          ← Team weekly reports
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{subjectName ? `${subjectName}'s weekly report` : "Weekly Report"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ring-1 ring-inset ${statusBadge.cls}`}>{statusBadge.text}</span>
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

      {!viewingOther && report.status === "CHANGES_REQUESTED" && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconAlertCircle className="w-4 h-4 shrink-0" />
            {report.reviewer?.name ?? "Your manager"} asked for changes
            {report.reviewedAt && <span className="font-normal text-amber-800">· {format(new Date(report.reviewedAt), "MMM d, h:mm a")}</span>}
          </div>
          {report.managerComment && <p className="text-sm mt-1.5 whitespace-pre-wrap">“{report.managerComment}”</p>}
          <p className="text-xs text-amber-800 mt-1.5">Update your summary below and submit again.</p>
        </div>
      )}
      {editable && report.status === "DRAFT" && weekStart < currentWeekStart && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This report for {weekLabel(weekStart)} hasn't been submitted yet.
        </div>
      )}

      <div className={`${card} px-4 py-3`}>
        <ReportTracker report={report} />
      </div>

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
      <ReportTaskList title="Overdue" tasks={report.overdueTasks} emptyLabel="Nothing overdue" dateField="dueDate" />

      {justSubmitted && !viewingOther && (
        <div role="status" className="rounded-xl border border-green-300 bg-green-50 px-4 py-4 text-green-900 flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <IconCheck className="w-4 h-4" />
          </span>
          <div>
            <div className="text-sm font-semibold">Report submitted</div>
            <p className="text-sm mt-0.5">
              {managerName ? `${managerName} will` : "Your manager will"} review it. We'll notify you if anything needs changing.
              Thanks for getting it in{isCurrentWeek ? "" : " for " + weekLabel(weekStart)}.
            </p>
          </div>
        </div>
      )}

      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <label htmlFor="weekly-summary" className="block text-sm font-medium text-gray-700">
            Summary / blockers / highlights
          </label>
          {editable && <SaveStatus state={autosave.state} savedAt={autosave.savedAt} />}
        </div>
        {editable ? (
          <textarea
            id="weekly-summary"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            rows={6}
            value={autosave.text}
            placeholder="What did you get done? Anything blocking you? Highlights worth sharing?"
            onChange={(e) => autosave.setText(e.target.value)}
          />
        ) : (
          <div id="weekly-summary" className="text-sm text-gray-800 whitespace-pre-wrap rounded-md bg-gray-50 border border-gray-100 px-3 py-2 min-h-[4rem]">
            {report.summary?.trim() ? report.summary : <span className="text-subtle">No summary was written.</span>}
          </div>
        )}
        {editable && (
          <div className="mt-3 flex items-center gap-3">
            <button onClick={() => submit.mutate()} disabled={submit.isPending} className={btnPrimary}>
              {submit.isPending ? "Submitting…" : report.status === "CHANGES_REQUESTED" ? "Resubmit report" : "Submit report"}
            </button>
            <span className="text-xs text-gray-600">Your manager is notified when you submit.</span>
          </div>
        )}
        {report.managerComment && report.status === "APPROVED" && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="text-xs font-medium text-gray-600 mb-1">Manager feedback{report.reviewer ? ` · ${report.reviewer.name}` : ""}</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.managerComment}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Saving…" / "Saved · 10:42" next to the summary box. */
function SaveStatus({ state, savedAt }: { state: ReturnType<typeof useSummaryAutosave>["state"]; savedAt: Date | null }) {
  let text = "Changes save automatically";
  let cls = "text-gray-600";
  if (state === "saving" || state === "dirty") text = "Saving…";
  else if (state === "saved" && savedAt) text = `Saved · ${format(savedAt, "h:mm a")}`;
  else if (state === "error") {
    text = "Couldn't save · retrying";
    cls = "text-red-700";
  }
  return (
    <span role="status" aria-live="polite" className={`text-xs ${cls}`}>
      {text}
    </span>
  );
}
