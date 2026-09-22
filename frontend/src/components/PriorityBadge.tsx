import { TaskPriority } from "@/types";
import { IconChevronsUp, IconChevronUp, IconChevronDown } from "@/components/icons";

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: (className: string) => JSX.Element }> = {
  URGENT: { label: "Urgent", color: "#ae2e24", icon: (c) => <IconChevronsUp className={c} /> },
  HIGH: { label: "High", color: "#c25100", icon: (c) => <IconChevronUp className={c} /> },
  MEDIUM: { label: "Medium", color: "#946f00", icon: (c) => <span className={`${c} block text-center leading-none`}>=</span> },
  LOW: { label: "Low", color: "#216e4e", icon: (c) => <IconChevronDown className={c} /> },
};

export default function PriorityBadge({ priority, showLabel = false }: { priority: TaskPriority; showLabel?: boolean }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.MEDIUM;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: cfg.color }} title={cfg.label}>
      {cfg.icon("w-3.5 h-3.5")}
      {showLabel && cfg.label}
    </span>
  );
}
