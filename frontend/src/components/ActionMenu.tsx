import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { IconMoreHorizontal } from "@/components/icons";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Explains a disabled item. */
  title?: string;
}

/**
 * A "⋯" button with a small menu. The menu is rendered in a portal with fixed positioning so
 * table wrappers with overflow scrolling can't clip it; it closes on outside click or Escape,
 * follows its button while the page scrolls or resizes, and closes if the button scrolls out of view.
 */
export default function ActionMenu({ items, label }: { items: ActionMenuItem[]; label: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    // Capture phase: a parent (like a draggable card) may stop key events from bubbling up to the document.
    document.addEventListener("keydown", onKey, true);
    function reposition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return close();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function toggle() {
    if (open) return setPos(null);
    const rect = buttonRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >
        <IconMoreHorizontal className="w-5 h-5" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className="fixed z-40 min-w-40 bg-white border border-gray-200 rounded-lg shadow-popover py-1"
          >
            {items.map((item) => (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  setPos(null);
                  item.onSelect();
                }}
                className={clsx(
                  "block w-full text-left px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                  item.danger ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
