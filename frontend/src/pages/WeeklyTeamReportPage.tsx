import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { addDays } from "date-fns";
import PeriodStepper from "@/components/PeriodStepper";
import { dayParam, parseDay, weekLabel, weekStartOf } from "@/lib/periods";
import { api } from "@/lib/api";
import { useCenters } from "@/hooks/useLookups";
import { useInstantEdit } from "@/hooks/useInstantEdit";
import ConfirmDialog from "@/components/ConfirmDialog";
import Avatar from "@/components/Avatar";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import ReportReviewDrawer, { TEAM_STATUS, TeamStatus } from "@/components/ReportReviewDrawer";
import QueryError, { LoadingText } from "@/components/QueryError";
import { IconUsers } from "@/components/icons";
import ReportsHeader from "@/components/ReportsHeader";
import { btnSecondary, filterControl } from "@/lib/ui";

interface TeamRow {
  user: { id: string; name: string; email: string };
  report: { id: string; status: string; tasksCompleted: number; hoursLogged: number; summary: string | null; submittedAt: string | null } | null;
  status: TeamStatus;
  overdueTaskCount: number;
}

/** People waiting on you first, then people who haven't handed anything in, then the rest. */
const ORDER: Record<TeamStatus, number> = { SUBMITTED: 0, OVERDUE: 1, PENDING: 2, CHANGES_REQUESTED: 3, APPROVED: 4 };

type ReviewEdit = { reportId: string; name: string; status: "APPROVED" | "CHANGES_REQUESTED" | "SUBMITTED"; managerComment?: string };

export default function WeeklyTeamReportPage() {
  const [centerId, setCenterId] = useState("");
  // Opens on last week: that's the one whose reports are due, so submissions and OVERDUE show up.
  const [params, setParams] = useSearchParams();
  const currentWeekStart = weekStartOf(new Date());
  const lastWeekStart = addDays(currentWeekStart, -7);
  const weekStart = params.get("week") ? weekStartOf(parseDay(params.get("week")!)) : lastWeekStart;
  const weekKey = dayParam(weekStart);
  const openMemberId = params.get("member");
  const updateParams = (changes: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k));
        return next;
      },
      { replace: true }
    );
  const goToWeek = (d: Date) => updateParams({ week: dayParam(d), member: null });
  const [confirmingRemindAll, setConfirmingRemindAll] = useState(false);
  const { data: centers } = useCenters();
  const queryClient = useQueryClient();

  const summaryKey = ["weekly-team-summary", centerId, weekKey];
  const summaryQuery = useQuery({
    queryKey: summaryKey,
    queryFn: async () =>
      (await api.get<TeamRow[]>("/reports/weekly/team-summary", { params: { centerId: centerId || undefined, week: weekKey } })).data,
    placeholderData: keepPreviousData,
  });
  const data = summaryQuery.data;
  const rows = [...(data ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.user.name.localeCompare(b.user.name));

  const nameOfReport = (reportId: string) => data?.find((r) => r.report?.id === reportId)?.user.name ?? "their";

  // Approving or sending back shows at once; the toast's Undo puts the report back in the queue.
  const review = useInstantEdit<ReviewEdit>({
    keys: [["weekly-team-summary"]],
    alsoRefetch: [["weekly-report"]],
    request: (e) =>
      e.status === "SUBMITTED"
        ? api.post(`/reports/weekly/${e.reportId}/unreview`)
        : api.post(`/reports/weekly/${e.reportId}/review`, { status: e.status, managerComment: e.managerComment }),
    optimistic: (qc, e) =>
      qc.setQueriesData<TeamRow[]>({ queryKey: ["weekly-team-summary"] }, (old) =>
        old?.map((row) =>
          row.report?.id === e.reportId ? { ...row, status: e.status as TeamStatus, report: { ...row.report, status: e.status } } : row
        )
      ),
    inverse: (_qc, e) => (e.status === "SUBMITTED" ? null : { reportId: e.reportId, name: e.name, status: "SUBMITTED" }),
    successMessage: (e) =>
      e.status === "APPROVED" ? `Approved ${e.name}'s report` : e.status === "CHANGES_REQUESTED" ? `Sent ${e.name}'s report back for changes` : `${e.name}'s report is back in the queue`,
    errorTitle: (e) => `Couldn't update ${e.name}'s report`,
  });

  const remind = useMutation({
    mutationFn: async (userIds: string[]) => (await api.post<{ sent: number; skipped: number }>("/reports/weekly/remind", { userIds, week: weekKey })).data,
    meta: {
      errorTitle: "Couldn't send the reminder",
      successMessage: (res: { sent: number; skipped: number }, userIds: string[]) => {
        const who = userIds.length === 1 ? data?.find((r) => r.user.id === userIds[0])?.user.name ?? "them" : `${res.sent} ${res.sent === 1 ? "person" : "people"}`;
        if (res.sent === 0) return userIds.length === 1 ? `${who} was reminded recently, so nothing was sent` : "Everyone was reminded recently, so nothing was sent";
        return res.skipped > 0 ? `Reminded ${who} · ${res.skipped} skipped (reminded recently)` : `Reminded ${who}`;
      },
    },
  });

  const submitted = rows.filter((r) => r.status === "SUBMITTED" || r.status === "APPROVED").length;
  const awaiting = rows.filter((r) => r.status === "SUBMITTED").length;
  const missingRows = rows.filter((r) => r.status === "PENDING" || r.status === "OVERDUE");
  const overdueTasks = rows.reduce((n, r) => n + r.overdueTaskCount, 0);
  const openRow = rows.find((r) => r.user.id === openMemberId);

  return (
    <div className="space-y-4">
      <ReportsHeader kind="weekly" scope="team" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">Team weekly</h2>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodStepper
            unit="week"
            label={weekLabel(weekStart)}
            onPrev={() => goToWeek(addDays(weekStart, -7))}
            onNext={() => goToWeek(addDays(weekStart, 7))}
            nextDisabled={weekStart >= currentWeekStart}
            onCurrent={weekStart.getTime() === currentWeekStart.getTime() ? undefined : () => goToWeek(currentWeekStart)}
          />
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
        </div>
      </div>

      {!data &&
        (summaryQuery.isError ? (
          <QueryError title="Couldn't load team reports" error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} retrying={summaryQuery.isFetching} />
        ) : (
          <LoadingText />
        ))}

      {data && data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Submitted" value={`${submitted}/${rows.length}`} accent="#216e4e" />
          <StatCard label="Awaiting review" value={awaiting} accent="#0c66e4" />
          <StatCard label="Missing" value={missingRows.length} accent="#946f00" />
          <StatCard label="Overdue tasks" value={overdueTasks} accent="#ae2e24" />
        </div>
      )}

      {missingRows.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <span className="text-sm text-amber-900">
            {missingRows.length} {missingRows.length === 1 ? "person hasn't" : "people haven't"} submitted.
          </span>
          <button onClick={() => setConfirmingRemindAll(true)} disabled={remind.isPending} className={btnSecondary}>
            Remind all missing
          </button>
        </div>
      )}

      {data?.length === 0 && (
        <EmptyState icon={<IconUsers />} title="No team members found" description="Reports from the people who report to you show up here." />
      )}

      {rows.length > 0 && (
        <ul className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
          {rows.map((row) => {
            const s = TEAM_STATUS[row.status];
            const missing = row.status === "PENDING" || row.status === "OVERDUE";
            return (
              <li
                key={row.user.id}
                onClick={() => updateParams({ member: row.user.id })}
                className="px-4 py-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-gray-50"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar name={row.user.name} size="md" />
                  <div className="min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateParams({ member: row.user.id });
                      }}
                      className="text-sm font-medium text-gray-800 hover:text-brand-700 hover:underline text-left"
                    >
                      {row.user.name}
                    </button>
                    <div className="text-xs text-gray-600">
                      {row.report ? `${row.report.tasksCompleted} completed · ${row.report.hoursLogged.toFixed(1)}h logged` : "No report yet"}
                    </div>
                    {row.report?.summary?.trim() ? (
                      <p className="text-sm text-gray-700 mt-1 line-clamp-2 whitespace-pre-line">{row.report.summary}</p>
                    ) : (
                      !missing && <p className="text-sm text-subtle mt-1">No summary written</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {row.overdueTaskCount > 0 && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-800 ring-1 ring-inset ring-red-200">
                      {row.overdueTaskCount} overdue
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${s.cls}`}>{s.label}</span>
                  {row.report && row.status === "SUBMITTED" && (
                    <button
                      onClick={() => review.mutate({ reportId: row.report!.id, name: row.user.name, status: "APPROVED" })}
                      className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                    >
                      Approve
                    </button>
                  )}
                  {missing && (
                    <button
                      onClick={() => remind.mutate([row.user.id])}
                      disabled={remind.isPending}
                      className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                      aria-label={`Remind ${row.user.name}`}
                    >
                      Remind
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openRow && (
        <ReportReviewDrawer
          key={openRow.user.id}
          member={openRow.user}
          status={openRow.status}
          weekKey={weekKey}
          onClose={() => updateParams({ member: null })}
          onApprove={(managerComment) => {
            review.mutate({ reportId: openRow.report!.id, name: openRow.user.name, status: "APPROVED", managerComment });
          }}
          onRequestChanges={(managerComment) => {
            review.mutate({ reportId: openRow.report!.id, name: openRow.user.name, status: "CHANGES_REQUESTED", managerComment });
          }}
          onRemind={() => remind.mutate([openRow.user.id])}
          busy={review.isPending || remind.isPending}
        />
      )}

      {confirmingRemindAll && (
        <ConfirmDialog
          title={`Remind ${missingRows.length} ${missingRows.length === 1 ? "person" : "people"}?`}
          description={
            <>
              <p>They'll each get a notification to submit their report for {weekLabel(weekStart)}:</p>
              <p className="mt-1 text-gray-800">{missingRows.map((r) => r.user.name).join(", ")}</p>
            </>
          }
          confirmLabel="Send reminders"
          onCancel={() => setConfirmingRemindAll(false)}
          onConfirm={async () => {
            await remind.mutateAsync(missingRows.map((r) => r.user.id)).catch(() => {});
            setConfirmingRemindAll(false);
          }}
        />
      )}
    </div>
  );
}
