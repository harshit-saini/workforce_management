import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { btnSecondary } from "@/lib/ui";

/** "‹ Sep 21 – 27 ›" with a "Current" shortcut. Reports can't be opened for periods that haven't started. */
export default function PeriodStepper({
  label,
  unit,
  onPrev,
  onNext,
  nextDisabled,
  onCurrent,
}: {
  label: string;
  unit: "week" | "month";
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  /** Shown only when not already on the current period. */
  onCurrent?: () => void;
}) {
  const arrow = "rounded-md p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border border-gray-300 bg-white">
        <button onClick={onPrev} className={arrow} aria-label={`Previous ${unit}`}>
          <IconChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 text-sm font-medium text-gray-800 min-w-32 text-center" aria-live="polite">
          {label}
        </span>
        <button onClick={onNext} disabled={nextDisabled} className={arrow} aria-label={`Next ${unit}`}>
          <IconChevronRight className="w-4 h-4" />
        </button>
      </div>
      {onCurrent && (
        <button onClick={onCurrent} className={btnSecondary}>
          Current {unit}
        </button>
      )}
    </div>
  );
}
