import { format } from "date-fns";
import { ReportStatus } from "@/types";
import { IconAlertCircle, IconCheck } from "@/components/icons";

interface Props {
  report: { status: ReportStatus; createdAt: string; submittedAt: string | null; reviewedAt: string | null };
}

type StepState = "done" | "current" | "todo" | "warn";

const when = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, h:mm a") : null);

/** Where a weekly report stands: Draft → Submitted → Reviewed, with the time of each step. */
export default function ReportTracker({ report }: Props) {
  const { status } = report;
  const steps: { label: string; detail: string; state: StepState }[] = [
    {
      label: "Draft",
      detail: status === "DRAFT" ? "Writing" : status === "CHANGES_REQUESTED" ? "Editing again" : `Started ${when(report.createdAt)}`,
      state: status === "DRAFT" || status === "CHANGES_REQUESTED" ? "current" : "done",
    },
    {
      label: "Submitted",
      detail: report.submittedAt && status !== "DRAFT" ? when(report.submittedAt)! : "Not yet",
      state: status === "DRAFT" ? "todo" : "done",
    },
    {
      label: status === "APPROVED" ? "Approved" : status === "CHANGES_REQUESTED" ? "Changes requested" : "Reviewed",
      detail:
        status === "APPROVED" || status === "CHANGES_REQUESTED"
          ? when(report.reviewedAt) ?? "Done"
          : status === "SUBMITTED"
            ? "Waiting for your manager"
            : "Not yet",
      state: status === "APPROVED" ? "done" : status === "CHANGES_REQUESTED" ? "warn" : status === "SUBMITTED" ? "current" : "todo",
    },
  ];

  return (
    <ol aria-label="Report progress" className="flex items-start">
      {steps.map((step, i) => (
        <li key={step.label} className="flex-1 min-w-0 flex flex-col items-center text-center relative" aria-current={step.state === "current" ? "step" : undefined}>
          {i > 0 && (
            <span
              aria-hidden
              className={`absolute top-3 right-1/2 w-full h-0.5 -z-0 ${steps[i - 1].state === "done" && step.state !== "todo" ? "bg-green-600" : "bg-gray-200"}`}
            />
          )}
          <span
            className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ring-2 ring-white ${
              step.state === "done"
                ? "bg-green-600 text-white"
                : step.state === "warn"
                  ? "bg-amber-500 text-white"
                  : step.state === "current"
                    ? "bg-brand-600 text-white"
                    : "bg-gray-200 text-gray-600"
            }`}
          >
            {step.state === "done" ? <IconCheck className="w-3.5 h-3.5" /> : step.state === "warn" ? <IconAlertCircle className="w-3.5 h-3.5" /> : i + 1}
          </span>
          <span className="mt-1 text-xs font-medium text-gray-800">{step.label}</span>
          <span className="text-[11px] text-gray-600 leading-tight px-1">{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}
