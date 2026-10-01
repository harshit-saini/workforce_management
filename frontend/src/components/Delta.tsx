/** "▲ 2 vs last week": the change since the previous period, in words and an arrow (never color alone). */
export default function Delta({
  now,
  before,
  label,
  goodWhen = "up",
  unit = "",
  digits = 0,
}: {
  now: number;
  before: number;
  label: string;
  /** Whether a rise is good news (completed tasks) or bad news (overdue). */
  goodWhen?: "up" | "down";
  unit?: string;
  digits?: number;
}) {
  const diff = Number((now - before).toFixed(digits));
  if (diff === 0) return <span className="text-gray-600">No change vs {label}</span>;
  const up = diff > 0;
  const good = (goodWhen === "up") === up;
  return (
    <span className={good ? "text-green-700" : "text-red-700"}>
      <span className="sr-only">{up ? "Up " : "Down "}</span>
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(diff).toFixed(digits)}
      {unit} vs {label}
    </span>
  );
}
