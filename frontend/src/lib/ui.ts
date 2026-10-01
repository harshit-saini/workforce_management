export const btnPrimary =
  "inline-flex min-h-10 md:min-h-0 items-center justify-center gap-1.5 bg-brand-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnSecondary =
  "inline-flex min-h-10 md:min-h-0 items-center justify-center gap-1.5 bg-white text-gray-700 text-sm font-medium px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnDanger =
  "inline-flex min-h-10 md:min-h-0 items-center justify-center gap-1.5 text-red-600 text-sm font-medium hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnDangerSolid =
  "inline-flex min-h-10 md:min-h-0 items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-red-700 active:bg-red-800 disabled:opacity-50 disabled:pointer-events-none transition-colors";

export const btnGhost =
  "inline-flex min-h-10 md:min-h-0 items-center justify-center gap-1.5 text-gray-500 text-sm font-medium hover:bg-gray-100 hover:text-gray-800 px-3 py-1.5 rounded-md disabled:opacity-50 disabled:pointer-events-none transition-colors";

/** Look of a filter control (select / search box); highlighted when it has a value set. */
export const filterControl = (active: boolean) =>
  `min-h-10 md:min-h-0 border rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
    active ? "border-brand-500 bg-brand-50 text-brand-800" : "border-gray-300 bg-white text-gray-700"
  }`;

/** Toggle chip for quick filters. */
export const quickChip = (active: boolean) =>
  `inline-flex min-h-10 md:min-h-0 items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${
    active
      ? "border-brand-500 bg-brand-50 text-brand-800"
      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
  }`;

export const card = "bg-white rounded-xl border border-gray-200/80 shadow-card";

/** Adds an alpha channel to a #rrggbb hex color, for Jira-style tinted "lozenge" badge backgrounds. */
export function withAlpha(hex: string, alpha: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  return `#${clean}${alpha}`;
}

/** Icon-only buttons: a 40px touch target on phones, compact on desktop. */
export const btnIcon =
  "inline-flex h-10 w-10 md:h-8 md:w-8 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50";
