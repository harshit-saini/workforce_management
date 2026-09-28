import { CSSProperties, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { IconChevronDown } from "@/components/icons";

export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
}

const MAX_VISIBLE = 100;
const POPOVER_HEIGHT = 300;

/**
 * Spreadsheet-style dropdown cell: shows plain text until opened, then a searchable list.
 * The list renders into a portal with fixed positioning so the scrolling grid can't clip it.
 */
export default function ComboCell({
  id,
  value,
  options,
  emptyLabel,
  showValue = false,
  onChange,
}: {
  id: string;
  value: string;
  options: ComboOption[];
  /** Label for the blank choice, e.g. "Unassigned". */
  emptyLabel: string;
  /** Display the raw value (e.g. an email) instead of the option label when closed. */
  showValue?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const isUnknown = value !== "" && !selected;
  const display = value === "" ? emptyLabel : selected ? (showValue ? selected.value : selected.label) : value;

  const allOptions = useMemo(() => [{ value: "", label: emptyLabel }, ...options], [options, emptyLabel]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    );
  }, [allOptions, query]);
  const visible = filtered.slice(0, MAX_VISIBLE);

  function openMenu(initialQuery = "") {
    if (!buttonRef.current) return;
    setAnchor(buttonRef.current.getBoundingClientRect());
    setQuery(initialQuery);
    const selectedIndex = allOptions.findIndex((o) => o.value === value);
    setHighlight(!initialQuery && selectedIndex >= 0 && selectedIndex < MAX_VISIBLE ? selectedIndex : 0);
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  function choose(option: ComboOption) {
    onChange(option.value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popoverRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    // The popover is fixed-positioned, so it would drift away from its cell on scroll.
    const onScroll = (e: Event) => {
      if (!popoverRef.current?.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible[highlight]) choose(visible[highlight]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  function onButtonKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openMenu();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== " ") {
      // Typing on a focused cell starts a search, like a spreadsheet.
      e.preventDefault();
      openMenu(e.key);
    }
  }

  let popoverStyle: CSSProperties | undefined;
  if (anchor) {
    const width = Math.max(anchor.width, 280);
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    const openUp = anchor.bottom + POPOVER_HEIGHT > window.innerHeight && anchor.top > POPOVER_HEIGHT;
    popoverStyle = openUp
      ? { position: "fixed", left, width, bottom: window.innerHeight - anchor.top + 2 }
      : { position: "fixed", left, width, top: anchor.bottom + 2 };
  }

  return (
    <>
      <button
        id={id}
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        className="w-full h-full min-h-[34px] px-2 py-1.5 flex items-center justify-between gap-1 text-left text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
      >
        <span className={clsx("truncate", value === "" && "text-gray-400")}>{display}</span>
        <IconChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-400" />
      </button>

      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popoverRef}
            style={popoverStyle}
            className="z-50 bg-white border border-gray-200 rounded-lg shadow-popover flex flex-col overflow-hidden"
          >
            {isUnknown && (
              <div className="px-3 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100">
                "{value}" doesn't match anything in your organization — choose a replacement:
              </div>
            )}
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder="Search…"
              className="px-3 py-2 text-sm border-b border-gray-100 outline-none"
            />
            <ul className="overflow-y-auto py-1" style={{ maxHeight: POPOVER_HEIGHT - 80 }} role="listbox">
              {visible.map((option, index) => (
                <li
                  key={option.value || "__empty"}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  onMouseEnter={() => setHighlight(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(option);
                  }}
                  className={clsx(
                    "px-3 py-1.5 text-sm cursor-pointer flex items-center justify-between gap-3",
                    index === highlight && "bg-brand-50",
                    option.value === value && "font-medium text-brand-700"
                  )}
                >
                  <span className={clsx("truncate", option.value === "" && "italic text-gray-500")}>{option.label}</span>
                  {option.sublabel && <span className="text-xs text-gray-400 truncate">{option.sublabel}</span>}
                </li>
              ))}
              {visible.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches</li>}
            </ul>
            {filtered.length > MAX_VISIBLE && (
              <div className="px-3 py-1.5 text-xs text-gray-400 border-t border-gray-100">
                Showing {MAX_VISIBLE} of {filtered.length} — keep typing to narrow down
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
