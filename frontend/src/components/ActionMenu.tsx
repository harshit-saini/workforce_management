import { useEffect, useState } from "react";
import { usePopover } from "@/hooks/usePopover";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { IconMoreHorizontal } from "@/components/icons";
import { btnIcon } from "@/lib/ui";

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
  const { open, setOpen, close, triggerRef: buttonRef, panelRef: menuRef } = usePopover<HTMLButtonElement>();

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return close();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  // Follow the button while the page scrolls or resizes (the menu is fixed-positioned in a portal).
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggle() {
    if (open) return close();
    place();
    setOpen(true);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={btnIcon}
      >
        <IconMoreHorizontal className="w-5 h-5" />
      </button>
      {open && pos &&
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
                  close();
                  item.onSelect();
                }}
                className={clsx(
                  "block w-full text-left px-3 py-2.5 md:py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed",
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
