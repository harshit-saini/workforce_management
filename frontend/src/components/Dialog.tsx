import { ReactNode, useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { IconX } from "@/components/icons";

/** Open dialogs, topmost last. Only the topmost one answers Escape, Tab and outside clicks. */
const stack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = "";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZE = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-3xl" } as const;
/** Sheets are narrower than a phone's full width only on larger screens. */
const SHEET_SIZE = { md: "max-w-md", lg: "max-w-xl" } as const;

interface Props {
  /** "modal" is centered; "sheet" slides in from the right and has a sticky header with a close button. */
  variant?: "modal" | "sheet";
  /** Modal: sm 24rem · md 28rem · lg 32rem · xl 48rem. Sheet: md 28rem · lg 36rem (default). */
  size?: keyof typeof SIZE;
  /** Shown in the sheet's sticky header; names the dialog unless `label` is given. */
  title?: ReactNode;
  /** The dialog's name for screen readers when there's no visible `title`. */
  label?: string;
  /** For modals that have their own heading: the heading element's id. */
  labelledBy?: string;
  /** Extra controls in the sheet header, next to the close button (e.g. "Copy link"). */
  headerActions?: ReactNode;
  onClose: () => void;
  /** Escape and a click on the backdrop call `onClose` unless this is true (e.g. while saving). */
  busy?: boolean;
  /** Turn off backdrop-click closing (for forms with typed text); Escape still works. */
  closeOnOutside?: boolean;
  /** Darker backdrop, for full-attention viewers. */
  backdrop?: "default" | "dark";
  /** Where a modal sits vertically; "top" suits a search box that grows downward. */
  align?: "center" | "top";
  panelClassName?: string;
  children: ReactNode;
}

/**
 * The one dialog every overlay uses. It names itself to screen readers, closes on Escape and on a click
 * outside, keeps Tab inside, puts focus back where it was when it closes, and stops the page behind
 * it scrolling. Dialogs can nest: only the top one reacts.
 */
export default function Dialog({
  variant = "modal",
  size,
  title,
  label,
  labelledBy,
  headerActions,
  onClose,
  busy,
  closeOnOutside = true,
  backdrop = "default",
  align = "center",
  panelClassName,
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(Symbol("dialog"));
  const titleId = useId();
  const downOnBackdrop = useRef(false);
  const sheetRef = useRef(variant === "sheet");
  // Always call the latest handlers without re-running the effects below.
  const live = useRef({ onClose, busy });
  live.current = { onClose, busy };

  useEffect(() => {
    const id = idRef.current;
    stack.push(id);
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    // Focus: an element marked data-autofocus; else a modal's first field. A side sheet takes focus itself,
    // so a stray keypress can't land in its first editable field.
    const panel = panelRef.current!;
    const first =
      panel.querySelector<HTMLElement>("[data-autofocus]") ??
      (sheetRef.current ? null : panel.querySelector<HTMLElement>(`[data-dialog-body] ${FOCUSABLE}`) ?? panel.querySelector<HTMLElement>(FOCUSABLE));
    (first ?? panel).focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape" && !e.defaultPrevented && !live.current.busy) {
        e.preventDefault();
        live.current.onClose();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(id), 1);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      // Give focus back to whatever opened the dialog, if it's still on the page.
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || stack[stack.length - 1] !== idRef.current) return;
    const panel = panelRef.current!;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) {
      e.preventDefault();
      panel.focus();
      return;
    }
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstEl || active === panel)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    } else if (!panel.contains(active)) {
      e.preventDefault();
      firstEl.focus();
    }
  }, []);

  const sheet = variant === "sheet";
  const named = label ? { "aria-label": label } : title ? { "aria-labelledby": titleId } : { "aria-labelledby": labelledBy };

  return createPortal(
    <div
      data-dialog-overlay
      className={clsx("fixed inset-0 z-50", backdrop === "dark" ? "bg-black/70" : "bg-black/30", sheet ? "flex justify-end" : clsx("flex justify-center p-4", align === "top" ? "items-start pt-[12vh]" : "items-center"))}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Both the press and the release must be on the backdrop, so dragging a text selection out of the box doesn't close it.
        if (closeOnOutside && !live.current.busy && downOnBackdrop.current && e.target === e.currentTarget) live.current.onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...named}
        className={clsx(
          "bg-white shadow-xl focus:outline-none",
          sheet
            ? clsx("relative flex h-full w-full flex-col overflow-y-auto", SHEET_SIZE[size === "md" || size === "sm" ? "md" : "lg"])
            : clsx("w-full rounded-xl shadow-popover max-h-[90vh] overflow-y-auto", SIZE[size ?? "md"]),
          panelClassName
        )}
      >
        {sheet && (
          <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-4 sm:px-6">
            <div id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
              {title}
            </div>
            {headerActions}
            <button
              onClick={() => live.current.onClose()}
              aria-label="Close"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        )}
        {!sheet && title && (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        )}
        <div data-dialog-body className={sheet ? "p-4 sm:p-6" : undefined}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
