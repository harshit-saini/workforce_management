import { useState } from "react";
import clsx from "clsx";

export type RangePreset = "this_week" | "last_week" | "last_2_weeks" | "custom";

export interface RangeValue {
  preset: RangePreset;
  startDate?: string;
  endDate?: string;
}

const presets: { value: RangePreset; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_2_weeks", label: "Last 2 weeks" },
  { value: "custom", label: "Custom range" },
];

export default function DateRangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
  const [start, setStart] = useState(value.startDate ?? "");
  const [end, setEnd] = useState(value.endDate ?? "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange({ preset: p.value, startDate: start, endDate: end })}
          className={clsx(
            "px-3 py-1.5 rounded-md text-sm border",
            value.preset === p.value
              ? "bg-brand-600 text-white border-brand-600"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          )}
        >
          {p.label}
        </button>
      ))}
      {value.preset === "custom" && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              onChange({ preset: "custom", startDate: e.target.value, endDate: end });
            }}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              onChange({ preset: "custom", startDate: start, endDate: e.target.value });
            }}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm"
          />
        </div>
      )}
    </div>
  );
}
