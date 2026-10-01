import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type AutosaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 1000;
const RETRY_MS = 5000;

/**
 * Keeps a weekly report's summary saved while it's being written: a second after typing stops it is
 * sent to the server, a failed save retries on its own, and whatever is still unsaved is sent when the
 * page is left (switching week, navigating away, hiding the tab).
 */
export function useSummaryAutosave(reportId: string, initial: string, enabled: boolean) {
  const [text, setTextState] = useState(initial);
  const [state, setState] = useState<AutosaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const latest = useRef(initial);
  const lastSaved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saving = useRef<Promise<boolean> | null>(null);

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) await saving.current;
    if (latest.current === lastSaved.current) return true;
    const value = latest.current;
    setState("saving");
    const run = (async () => {
      try {
        await api.put(`/reports/weekly/${reportId}/summary`, { summary: value });
        lastSaved.current = value;
        setSavedAt(new Date());
        setState(latest.current === value ? "saved" : "dirty");
        return true;
      } catch {
        setState("error");
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = run;
    return run;
  }, [reportId]);

  function setText(value: string) {
    latest.current = value;
    setTextState(value);
    setState(value === lastSaved.current ? "idle" : "dirty");
  }

  // Debounced save while typing; a failed save tries again shortly.
  useEffect(() => {
    if (!enabled) return;
    if (state !== "dirty" && state !== "error") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), state === "error" ? RETRY_MS : DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [text, state, enabled, save]);

  // Don't lose the last few seconds of typing when leaving.
  useEffect(() => {
    if (!enabled) return;
    const flushNow = () => {
      if (latest.current !== lastSaved.current) void api.put(`/reports/weekly/${reportId}/summary`, { summary: latest.current }).catch(() => {});
    };
    const onHide = () => document.visibilityState === "hidden" && flushNow();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
  }, [reportId, enabled]);

  return { text, setText, state, savedAt, flush: save, latest };
}
