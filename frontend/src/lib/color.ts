/** WCAG 2.x contrast helpers — used to keep colored badge text readable whatever color an admin picks. */

type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as RGB;
}

const toHex = (rgb: RGB) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: RGB): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `color` painted at `alpha` (0–1) over an opaque `backdrop` (white by default). */
export function blend(color: RGB, alpha: number, backdrop: RGB = [255, 255, 255]): RGB {
  return color.map((c, i) => c * alpha + backdrop[i] * (1 - alpha)) as RGB;
}

export const AA_TEXT = 4.5;
/** The tint behind status badges: the status color at 15% over white. */
export const BADGE_TINT_ALPHA = 0.15;

export interface BadgeColors {
  background: string;
  text: string;
  /** True when the picked color was too light to use as text and had to be darkened. */
  adjusted: boolean;
}

/**
 * Colors for a status "lozenge": the status color as a light tint, with text darkened (same hue)
 * until it reaches WCAG AA (4.5:1) on that tint. Dark colors are left as they are.
 */
export function badgeColors(hex: string): BadgeColors {
  const rgb = hexToRgb(hex);
  if (!rgb) return { background: "#f3f4f6", text: "#374151", adjusted: false };
  // Measure the whole-number values the browser will actually paint, not the fractional blend.
  const round = (c: RGB) => c.map((v) => Math.round(v)) as RGB;
  const background = round(blend(rgb, BADGE_TINT_ALPHA));
  let text = rgb;
  let adjusted = false;
  for (let step = 1; contrastRatio(text, background) < AA_TEXT && step <= 40; step++) {
    // Mix toward black a little at a time, so the hue stays recognisable.
    text = round(rgb.map((c) => c * (1 - step * 0.025)) as RGB);
    adjusted = true;
  }
  return { background: toHex(background), text: toHex(text), adjusted };
}

/** Text color that is readable (4.5:1) on the badge tint for this status color. */
export const readableText = (hex: string) => badgeColors(hex).text;
