import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { WeeklyReport } from "@/types";
import Avatar from "@/components/Avatar";
import ReportTracker from "@/components/ReportTracker";
import ReportTaskList from "@/components/ReportTaskList";
import QueryError from "@/components/QueryError";
import { IconX } from "@/components/icons";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export type TeamStatus = "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "OVERDUE";

export const TEAM_STATUS: Record<TeamStatus, { label: string; cls: string }> = {
  SUBMITTED: { label: "Awaiting review", cls: "bg-blue-50 text-blue-800 ring-blue-200" },
  APPROVED: { label: "Approved", cls: "bg-green-50 text-green-800 ring-green-200" },
  CHANGES_REQUESTED: { label: "Changes requested", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  PENDING: { label: "Not submitted", cls: "bg-gray-100 text-gray-700 ring-gray-200" },
  OVERDUE: { label: "Overdue", cls: "bg-red-50 text-red-800 ring-red-200" },
};

interface Props {
  member: { id: string; name: string; email: string };
  status: TeamStatus;
  weekKey: string;
  onClose: () => void;
  onApprove: (managerComment?: string) => void;
  onRequestChanges: (managerComment: string) => void;
  onRemind: () => void;
  busy?: boolean;
}

/** A team member's week at a glance: what they wrote, the numbers, the task lists, and a box to answer. */
export default function ReportReviewDrawer({ member, status, weekKey, onClose, onApprove, onRequestChanges, onRemind, busy }: Props) {
  const [comment, setComment] = useState("");
  const reportQuery = useQuery({
    queryKey: ["weekly-report", member.id, weekKey],
    queryFn: async () => (await api.get<WeeklyReport>("/reports/weekly", { params: { userId: member.id, week: weekKey } })).data,
  });
  const report = reportQuery.data;
  const s = TEAM_STATUS[status];
  const missing = status === "PENDING" || status === "OVERDUE";

  function close() {
    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={close} />
      <div role="dialog" aria-modal="true" aria-label={`${member.name}'s weekly report`} className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl p-4 sm:p-6">
        <button onClick={close} className="absolute top-4 right-4 text-subtle hover:text-gray-700" aria-label="Close">
          <IconX className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          <Avatar name={member.name} size="md" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{member.name}</h2>
            <div className="text-sm text-gray-600 truncate">{member.email}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ring-1 ring-inset ${s.cls}`}>{s.label}</span>
          <Link to={`/reports/weekly?userId=${member.id}&week=${weekKey}`} className="text-xs text-brand-700 hover:underline">
            Open full report
          </Link>
        </div>

        {!report &&
          (reportQuery.isError ? (
            <QueryError className="mt-6" title="Couldn't load this report" error={reportQuery.error} onRetry={() => reportQuery.refetch()} retrying={reportQuery.isFetching} />
          ) : (
            <div className="text-sm text-subtle mt-6">Loading…</div>
          ))}

        {report && (
          <>
            <div className="mt-5 rounded-lg border border-gray-100 px-4 py-3">
              <ReportTracker report={report} />
            </div>

            <section className="mt-5" aria-label="Summary">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">What {member.name.split(" ")[0]} wrote</h3>
              {report.summary?.trim() ? (
                <p className="text-sm text-gray-800 whitespace-pre-wrap rounded-md bg-gray-50 border border-gray-100 px-3 py-2">{report.summary}</p>
              ) : (
                <p className="text-sm text-subtle">{missing ? "Nothing written yet." : "No summary was written."}</p>
              )}
            </section>

            <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
              {[
                ["Completed", report.tasksCompleted],
                ["Carried over", report.tasksCarriedOver],
                ["Blocked", report.tasksBlocked],
                ["Hours", report.hoursLogged.toFixed(1)],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md bg-gray-50 border border-gray-100 py-2">
                  <dd className="text-lg font-semibold text-gray-900">{value}</dd>
                  <dt className="text-[11px] text-gray-600">{label}</dt>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-3">
              <ReportTaskList title="Completed" tasks={report.completedTasks} emptyLabel="No tasks completed" dateField="completedAt" />
              <ReportTaskList title="Overdue" tasks={report.overdueTasks} emptyLabel="Nothing overdue" dateField="dueDate" />
            </div>

            {report.managerComment && status !== "SUBMITTED" && (
              <section className="mt-5" aria-label="Your feedback">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Feedback sent{report.reviewer ? ` by ${report.reviewer.name}` : ""}</h3>
                <p className="text-sm text-gray-800 whitespace-pre-wrap rounded-md bg-amber-50 border border-amber-100 px-3 py-2">{report.managerComment}</p>
              </section>
            )}
          </>
        )}

        {status === "SUBMITTED" && (
          <section className="mt-6 border-t border-gray-100 pt-4" aria-label="Review">
            <label htmlFor="review-comment" className="block text-sm font-semibold text-gray-700 mb-1">
              Comment
            </label>
            <textarea
              id="review-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Optional when approving. Required to ask for changes."
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button disabled={busy} onClick={() => onApprove(comment.trim() || undefined)} className={btnPrimary}>
                Approve
              </button>
              <button disabled={busy || !comment.trim()} onClick={() => onRequestChanges(comment.trim())} className={btnSecondary}>
                Request changes
              </button>
            </div>
          </section>
        )}
        {missing && (
          <section className="mt-6 border-t border-gray-100 pt-4">
            <button onClick={onRemind} disabled={busy} className={btnPrimary}>
              Remind {member.name.split(" ")[0]}
            </button>
            <p className="text-xs text-gray-600 mt-1.5">Sends them a notification to submit this week's report.</p>
          </section>
        )}
      </div>
    </div>
  );
}
