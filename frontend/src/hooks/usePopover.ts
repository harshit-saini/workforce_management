import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/** The popover that's open right now. Opening another closes it, so two never overlap. */
let current: (() => void) | null = null;

/**
 * Open/close behavior for a dropdown: closes on a click outside, on Escape (focus goes back to the
 * trigger), and when the page changes — and only one popover is open at a time.
 * Attach `triggerRef` to the button and `panelRef` to the panel.
 */
export function usePopover<T extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return;
    if (current && current !== close) current();
    current = close;

    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Capture phase: close the popover without also closing a dialog it sits in.
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      if (current === close) current = null;
    };
  }, [open, close]);

  // Moving to another page closes it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setOpen(false);
  }, [location.pathname, location.search]);

  return { open, setOpen, close, toggle, triggerRef, panelRef };
}
