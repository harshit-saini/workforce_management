import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { scanTaskReminders } from "./reminders.js";
import { generateWeeklyReport } from "../modules/reports/reports.service.js";
import { generateMonthlyReport } from "../modules/reports/reports.service.js";
import { notifyUser } from "../lib/notify.js";
import { addDays } from "../lib/dates.js";

async function generateWeeklyReportsForAllUsers() {
  const users = await prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" } });
  const priorWeekAnchor = addDays(new Date(), -1); // Monday job covers the prior Mon-Sun week
  for (const user of users) {
    await generateWeeklyReport(user.organizationId, user.id, priorWeekAnchor);
  }
  console.log(`[cron] generated weekly reports for ${users.length} users`);
}

async function remindUnsubmittedWeeklyReports() {
  const users = await prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" } });
  const now = new Date();
  for (const user of users) {
    const report = await generateWeeklyReport(user.organizationId, user.id, addDays(now, -1));
    if (report.status === "DRAFT") {
      await notifyUser({
        organizationId: user.organizationId,
        userId: user.id,
        type: "WEEKLY_REPORT_DUE",
        message: "Your weekly report has not been submitted yet",
        relatedReportId: report.id,
        dedupeKey: `weekly-report-due:${report.id}`,
        cooldownMs: 6 * 24 * 60 * 60 * 1000,
      });
    }
  }
}

async function generateMonthlyReportsForAllUsers() {
  const users = await prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" } });
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prevMonthDate.getFullYear();
  const month = prevMonthDate.getMonth() + 1;
  for (const user of users) {
    await generateMonthlyReport(user.organizationId, user.id, year, month);
  }
  console.log(`[cron] generated monthly reports for ${users.length} users (${year}-${month})`);
}

export function startScheduler() {
  cron.schedule(config.cron.reminderScan, () => {
    scanTaskReminders().catch((err) => console.error("[cron] reminder scan failed", err));
  });

  // Monday 6am: generate the prior week's reports.
  cron.schedule("0 6 * * 1", () => {
    generateWeeklyReportsForAllUsers().catch((err) => console.error("[cron] weekly report generation failed", err));
  });

  // Weekly report submission deadline check (e.g. Monday noon).
  cron.schedule(config.cron.weeklyReportDeadline, () => {
    remindUnsubmittedWeeklyReports().catch((err) => console.error("[cron] weekly reminder failed", err));
  });

  // 1st of month: generate monthly rollups for the prior month.
  cron.schedule("0 5 1 * *", () => {
    generateMonthlyReportsForAllUsers().catch((err) => console.error("[cron] monthly report generation failed", err));
  });

  console.log("[cron] scheduler started");
}
