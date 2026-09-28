/**
 * Tiny app-wide toast store. Anything (components, React Query callbacks,
 * plain async handlers) can call `toast.success(...)` / `toast.error(...)`;
 * <Toaster /> subscribes and renders the stack.
 */

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss. Errors stay up longer by default. */
  duration?: number;
}

export interface Toast extends ToastOptions {
  id: number;
  tone: ToastTone;
  title: string;
  duration: number;
  /** Bumped when an identical toast is raised again, so its timer restarts instead of stacking a duplicate. */
  version: number;
}

const MAX_VISIBLE = 4;
const DEFAULT_DURATION: Record<ToastTone, number> = { success: 4000, info: 5000, error: 8000 };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function show(tone: ToastTone, title: string, options: ToastOptions = {}): number {
  const duration = options.duration ?? DEFAULT_DURATION[tone];
  const existing = toasts.find((t) => t.tone === tone && t.title === title && t.description === options.description);
  if (existing) {
    toasts = toasts.map((t) => (t.id === existing.id ? { ...t, ...options, duration, version: t.version + 1 } : t));
    emit();
    return existing.id;
  }
  const id = nextId++;
  toasts = [...toasts, { id, tone, title, ...options, duration, version: 0 }].slice(-MAX_VISIBLE);
  emit();
  return id;
}

export const toast = {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("error", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  dismiss(id: number) {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  },
};

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts() {
  return toasts;
}
