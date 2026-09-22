import { format } from "date-fns";
import clsx from "clsx";
import { ReportTaskSummary } from "@/types";
import PriorityBadge from "@/components/PriorityBadge";
import { IconCalendar } from "@/components/icons";
import { card } from "@/lib/ui";

export default function ReportTaskList({
  title,
  tasks,
  emptyLabel,
  dateField,
  overdue = false,
}: {
  title: string;
  tasks: ReportTaskSummary[];
  emptyLabel: string;
  dateField: "completedAt" | "dueDate";
  overdue?: boolean;
}) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">{title}</div>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="text-sm text-gray-400">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {tasks.map((t) => {
            const date = t[dateField];
            return (
              <li key={t.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-800 truncate">{t.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <PriorityBadge priority={t.priority} />
                  {date && (
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1 text-xs",
                        overdue ? "text-red-600 font-medium" : "text-gray-400"
                      )}
                    >
                      <IconCalendar className="w-3.5 h-3.5" />
                      {format(new Date(date), "MMM d")}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
