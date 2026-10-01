import { Link } from "react-router-dom";
import { taskHref } from "@/lib/links";
import { ReportTaskSummary } from "@/types";
import PriorityBadge from "@/components/PriorityBadge";
import DueDate from "@/components/DueDate";
import { formatDate } from "@/lib/dueState";
import { IconCheck } from "@/components/icons";
import { card } from "@/lib/ui";

export default function ReportTaskList({
  title,
  tasks,
  emptyLabel,
  dateField,
}: {
  title: string;
  tasks: ReportTaskSummary[];
  emptyLabel: string;
  dateField: "completedAt" | "dueDate";
}) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        <span className="text-xs text-subtle bg-gray-100 rounded-full px-1.5 py-0.5">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="text-sm text-subtle">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {tasks.map((t) => {
            const date = t[dateField];
            return (
              <li key={t.id}>
                <Link
                  to={taskHref(t.id)}
                  className="py-2 px-2 -mx-2 rounded-md flex items-center justify-between gap-3 text-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  <span className="text-gray-800 truncate">{t.title}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={t.priority} />
                    {date &&
                      (dateField === "completedAt" ? (
                        <span title={`Completed ${formatDate(date)}`} className="inline-flex items-center gap-1 text-xs text-subtle">
                          <IconCheck className="w-3.5 h-3.5" />
                          {formatDate(date)}
                        </span>
                      ) : (
                        <DueDate dueDate={date} done={false} />
                      ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
