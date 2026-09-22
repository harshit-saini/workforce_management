import { card } from "@/lib/ui";

export default function StatCard({
  label,
  value,
  sub,
  accent = "#0c66e4",
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className={`${card} p-4 border-l-[3px]`} style={{ borderLeftColor: accent }}>
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mt-1.5">{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
