// Deterministic pastel palette keyed by name, so the same person always gets the same color.
const PALETTE = [
  { bg: "#deebff", fg: "#0c66e4" },
  { bg: "#e3fcef", fg: "#216e4e" },
  { bg: "#fff0b3", fg: "#7f5f01" },
  { bg: "#ffe2dd", fg: "#ae2e24" },
  { bg: "#eae6ff", fg: "#5e4db2" },
  { bg: "#d3f1a7", fg: "#37471f" },
  { bg: "#fedec8", fg: "#a54800" },
  { bg: "#cce0ff", fg: "#09326c" },
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizeClass = {
  xs: "w-5 h-5 text-[10px]",
  sm: "w-6 h-6 text-[11px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
};

export default function Avatar({
  name,
  size = "sm",
  className = "",
}: {
  name: string | null | undefined;
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const label = name?.trim() || "Unassigned";
  const { bg, fg } = colorFor(label);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${sizeClass[size]} ${className}`}
      style={{ backgroundColor: bg, color: fg }}
      title={label}
    >
      {initials(label)}
    </span>
  );
}
