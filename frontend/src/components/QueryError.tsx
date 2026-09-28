import clsx from "clsx";
import { getErrorMessage } from "@/lib/errors";
import { IconAlertCircle, IconRefresh } from "@/components/icons";
import { btnSecondary } from "@/lib/ui";

/**
 * Shown in place of a page (or panel) whose data failed to load, so a failed
 * request never looks like an endless "Loading…".
 */
export default function QueryError({
  error,
  onRetry,
  retrying,
  title = "Couldn't load this page",
  className,
}: {
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        "rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 flex items-start gap-2.5",
        className
      )}
    >
      <IconAlertCircle className="w-5 h-5 shrink-0 text-red-600" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-red-800">{title}</div>
        <div className="mt-0.5">{getErrorMessage(error)}</div>
      </div>
      <button onClick={onRetry} disabled={retrying} className={clsx(btnSecondary, "shrink-0 -my-0.5")}>
        <IconRefresh className={clsx("w-4 h-4", retrying && "animate-spin")} />
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

export function LoadingText({ label = "Loading…" }: { label?: string }) {
  return <div className="text-gray-400 text-sm">{label}</div>;
}
