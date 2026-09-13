import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.ACCESS_TOKEN_TTL ?? "15m",
    refreshTtl: process.env.REFRESH_TOKEN_TTL ?? "7d",
  },
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
  // Comma-separated list of allowed frontend origins. Trailing slashes and
  // whitespace are stripped since browsers send Origin without a trailing
  // slash and a mismatch there silently breaks CORS matching.
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  cron: {
    reminderScan: process.env.REMINDER_SCAN_CRON ?? "0 * * * *",
    weeklyReportDeadline: process.env.WEEKLY_REPORT_DEADLINE_CRON ?? "0 12 * * 1",
  },
};
