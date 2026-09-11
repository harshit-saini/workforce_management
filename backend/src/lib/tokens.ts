import { randomBytes, createHash } from "node:crypto";

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function msFromDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * unitMs[unit];
}
