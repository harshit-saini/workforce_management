export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 bg-white text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnDanger =
  "inline-flex items-center justify-center gap-1.5 text-red-600 text-sm font-medium hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 text-gray-500 text-sm font-medium hover:bg-gray-100 hover:text-gray-800 px-3 py-1.5 rounded-md disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const card = "bg-white rounded-xl border border-gray-200/80 shadow-card";

/** Adds an alpha channel to a #rrggbb hex color, for Jira-style tinted "lozenge" badge backgrounds. */
export function withAlpha(hex: string, alpha: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  return `#${clean}${alpha}`;
}
