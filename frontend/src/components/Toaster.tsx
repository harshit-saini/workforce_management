import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { getToasts, subscribeToasts, toast, Toast, ToastTone } from "@/lib/toast";
import { IconAlertCircle, IconCheckCircle, IconInfo, IconX } from "@/components/icons";
import { btnGhost, card } from "@/lib/ui";

const toneStyles: Record<ToastTone, { border: string; icon: string }> = {
  success: { border: "border-l-green-600", icon: "text-green-600" },
  error: { border: "border-l-red-600", icon: "text-red-600" },
  info: { border: "border-l-brand-600", icon: "text-brand-600" },
};

const toneIcon: Record<ToastTone, typeof IconInfo> = {
  success: IconCheckCircle,
  error: IconAlertCircle,
  info: IconInfo,
};

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts);

  return (
    <div
      aria-live="polite"
      className="fixed z-50 bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t }: { toast: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  const startedAt = useRef(0);

  // A repeat of the same toast restarts its countdown.
  useEffect(() => {
    remaining.current = t.duration;
  }, [t.version, t.duration]);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => toast.dismiss(t.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, t.id, t.version]);

  const Icon = toneIcon[t.tone];

  return (
    <div
      role={t.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={clsx(
        card,
        "shadow-popover pointer-events-auto border-l-4 pl-3 pr-2 py-2.5 flex items-start gap-2.5 motion-safe:animate-toast-in",
        toneStyles[t.tone].border
      )}
    >
      <Icon className={clsx("w-5 h-5 shrink-0 mt-px", toneStyles[t.tone].icon)} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 break-words">{t.title}</div>
        {t.description && <div className="text-sm text-gray-600 mt-0.5 break-words">{t.description}</div>}
      </div>
      {t.action && (
        <button
          onClick={() => {
            t.action!.onClick();
            toast.dismiss(t.id);
          }}
          className={clsx(btnGhost, "px-2 py-1 -my-0.5 text-brand-700 hover:text-brand-800 shrink-0")}
        >
          {t.action.label}
        </button>
      )}
      <button
        onClick={() => toast.dismiss(t.id)}
        className="text-subtle hover:text-gray-700 rounded p-1 -my-0.5 shrink-0"
        aria-label="Dismiss notification"
      >
        <IconX className="w-4 h-4" />
      </button>
    </div>
  );
}
