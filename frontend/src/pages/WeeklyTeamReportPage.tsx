import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { addDays } from "date-fns";
import PeriodStepper from "@/components/PeriodStepper";
import { dayParam, parseDay, weekLabel, weekStartOf } from "@/lib/periods";
import { api } from "@/lib/api";
import { useCenters } from "@/hooks/useLookups";
import ConfirmDialog from "@/components/ConfirmDialog";
import QueryError, { LoadingText } from "@/components/QueryError";

interface TeamRow {
  user: { id: string; name: string; email: string };
  report: { id: string; status: string; tasksCompleted: number; hoursLogged: number; summary: string | null } | null;
  status: "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "OVERDUE";
  overdueTaskCount: number;
}

const statusColor: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-700",
  APPROVED: "bg-green-100 text-green-700",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-700",
  PENDING: "bg-gray-100 text-gray-600",
  OVERDUE: "bg-red-100 text-red-700",
};

export default function WeeklyTeamReportPage() {
  const [centerId, setCenterId] = useState("");
  // Opens on last week: that's the one whose reports are due, so submissions and OVERDUE show up.
  const [params, setParams] = useSearchParams();
  const currentWeekStart = weekStartOf(new Date());
  const lastWeekStart = addDays(currentWeekStart, -7);
  const weekStart = params.get("week") ? weekStartOf(parseDay(params.get("week")!)) : lastWeekStart;
  const weekKey = dayParam(weekStart);
  const goToWeek = (d: Date) => {
    const next = new URLSearchParams(params);
    next.set("week", dayParam(d));
    setParams(next);
  };
  /** The report being sent back; its dialog collects the (required) reason. */
  const [requestingChangesFor, setRequestingChangesFor] = useState<{ id: string; name: string } | null>(null);
  const { data: centers } = useCenters();
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ["weekly-team-summary", centerId, weekKey],
    queryFn: async () =>
      (await api.get<TeamRow[]>("/reports/weekly/team-summary", { params: { centerId: centerId || undefined, week: weekKey } })).data,
    placeholderData: keepPreviousData,
  });
  const { data } = summaryQuery;

  type ReviewVars = { id: string; name: string; status: string; managerComment?: string };
  const review = useMutation({
    mutationFn: ({ id, status, managerComment }: ReviewVars) =>
      api.post(`/reports/weekly/${id}/review`, { status, managerComment }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weekly-team-summary"] }),
    meta: {
      successMessage: (_: unknown, v: ReviewVars) =>
        v.status === "APPROVED" ? `Approved ${v.name}'s report` : `Sent ${v.name}'s report back for changes`,
      errorTitle: (v: ReviewVars) => `Couldn't update ${v.name}'s report`,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Team Weekly</h1>
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
          <select value={centerId} onChange={(e) => setCenterId(e.target.value)} className="border border-gray-300 rounded-md px-2 py-1.5 text-sm">
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
          <QueryError
            title="Couldn't load team reports"
            error={summaryQuery.error}
            onRetry={() => summaryQuery.refetch()}
            retrying={summaryQuery.isFetching}
          />
        ) : (
          <LoadingText />
        ))}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
        {data?.map((row) => (
          <div key={row.user.id} className="px-4 py-3 flex items-center justify-between">
            <div>
              <Link
                to={`/reports/weekly?userId=${row.user.id}&week=${weekKey}`}
                className="text-sm font-medium text-gray-800 hover:text-brand-700 hover:underline"
              >
                {row.user.name}
              </Link>
              {row.report && (
                <div className="text-xs text-subtle">
                  {row.report.tasksCompleted} completed · {row.report.hoursLogged.toFixed(1)}h logged
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {row.overdueTaskCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  {row.overdueTaskCount} overdue
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[row.status]}`}>{row.status}</span>
              {row.report && row.status === "SUBMITTED" && (
                <>
                  <button
                    disabled={review.isPending}
                    onClick={() => review.mutate({ id: row.report!.id, name: row.user.name, status: "APPROVED" })}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRequestingChangesFor({ id: row.report!.id, name: row.user.name })}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50"
                  >
                    Request changes
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {data?.length === 0 && <div className="px-4 py-6 text-sm text-subtle text-center">No team members found</div>}
      </div>

      {requestingChangesFor && (
        <ConfirmDialog
          title={`Send ${requestingChangesFor.name}'s report back?`}
          description={<p>They'll be notified and can edit and resubmit it. Tell them what needs to change.</p>}
          textInput={{ label: "What changes are needed?", placeholder: "e.g. Add what blocked the Q4 launch work" }}
          confirmLabel="Send back"
          onCancel={() => setRequestingChangesFor(null)}
          onConfirm={async (comment) => {
            await review
              .mutateAsync({ id: requestingChangesFor.id, name: requestingChangesFor.name, status: "CHANGES_REQUESTED", managerComment: comment })
              .catch(() => {});
            setRequestingChangesFor(null);
          }}
        />
      )}
    </div>
  );
}
