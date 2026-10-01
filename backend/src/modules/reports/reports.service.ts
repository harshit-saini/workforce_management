import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { AuthUser } from "../../plugins/auth.js";
import { getOverview } from "../overview/overview.service.js";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from "../../lib/dates.js";
import { getDownlineUserIds, getReportingChainUp } from "../../lib/hierarchy.js";
import { getStatusKeysByCategory } from "../../lib/taskStatuses.js";
import { z } from "zod";
import { submitWeeklySchema, reviewWeeklySchema, saveSummarySchema, remindWeeklySchema } from "./reports.schemas.js";
import { notifyUser } from "../../lib/notify.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "for", "is", "was", "are", "were",
  "with", "at", "by", "from", "this", "that", "it", "as", "be", "we", "i", "my", "our", "will",
]);

const reportTaskSelect = {
  id: true,
  title: true,
  priority: true,
  status: true,
  dueDate: true,
  completedAt: true,
} as const;

/** Tasks the user completed with a completedAt inside the given range — mirrors getOverview's "tasksCompleted". */
async function listCompletedTasksInRange(organizationId: string, userId: string, start: Date, end: Date) {
  const doneKeys = await getStatusKeysByCategory(organizationId, ["DONE"]);
  return prisma.task.findMany({
    where: { organizationId, assigneeId: userId, status: { in: doneKeys }, completedAt: { gte: start, lte: end } },
    select: reportTaskSelect,
    orderBy: { completedAt: "desc" },
  });
}

/** Tasks currently past their due date and not done — same predicate as the overdue-task reminder job. */
async function listOverdueTasksForUser(organizationId: string, userId: string) {
  const doneKeys = await getStatusKeysByCategory(organizationId, ["DONE"]);
  return prisma.task.findMany({
    where: { organizationId, assigneeId: userId, status: { notIn: doneKeys }, dueDate: { lt: new Date() } },
    select: reportTaskSelect,
    orderBy: { dueDate: "asc" },
  });
}

/** Reports are rebuilt when opened, but not more than once in this window (a team view opens many at once). */
const REFRESH_TTL_MS = 30_000;

/** Statuses where the employee can still change the report, so its numbers should keep following the tasks. */
const EDITABLE_REPORT_STATUSES = ["DRAFT", "CHANGES_REQUESTED"];

export async function generateWeeklyReport(organizationId: string, userId: string, anyDateInWeek: Date) {
  const weekStartDate = startOfWeek(anyDateInWeek);
  const weekEndDate = endOfWeek(anyDateInWeek);

  const overview = await getOverview(organizationId, { userIds: [userId] }, weekStartDate, weekEndDate);

  const existing = await prisma.weeklyReport.findUnique({
    where: { userId_weekStartDate: { userId, weekStartDate } },
  });
  // Once submitted, the numbers are frozen — that's what the manager reviewed.
  if (existing && !EDITABLE_REPORT_STATUSES.includes(existing.status)) return existing;

  return prisma.weeklyReport.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate } },
    update: {
      tasksCompleted: overview.tasksCompleted,
      tasksCarriedOver: overview.tasksOpen,
      tasksBlocked: overview.tasksBlocked,
      hoursLogged: overview.hoursLoggedTotal,
      daysLogged: overview.hoursByDay.length,
    },
    create: {
      organizationId,
      userId,
      weekStartDate,
      weekEndDate,
      tasksCompleted: overview.tasksCompleted,
      tasksCarriedOver: overview.tasksOpen,
      tasksBlocked: overview.tasksBlocked,
      hoursLogged: overview.hoursLoggedTotal,
      daysLogged: overview.hoursByDay.length,
    },
  });
}

/**
 * Which week to show when none is asked for: the oldest recent past week that still needs
 * submitting (the one the Monday reminder is nagging about), otherwise the current week.
 */
export async function getDefaultWeek(organizationId: string, userId: string, now = new Date()): Promise<Date> {
  const thisWeek = startOfWeek(now);
  const oldest = await prisma.weeklyReport.findFirst({
    where: {
      organizationId,
      userId,
      status: { in: ["DRAFT", "CHANGES_REQUESTED"] },
      weekStartDate: { lt: thisWeek, gte: addDays(thisWeek, -7 * 8) },
    },
    orderBy: { weekStartDate: "asc" },
    select: { weekStartDate: true },
  });
  return oldest?.weekStartDate ?? thisWeek;
}

export async function getWeeklyReport(organizationId: string, userId: string, anyDateInWeek: Date) {
  const weekStartDate = startOfWeek(anyDateInWeek);
  // Scoped by organizationId in addition to the userId/weekStartDate unique key, as defense in
  // depth against a caller passing a mismatched org — see assertCanViewUserReport in routes.
  const existing = await prisma.weeklyReport.findFirst({
    where: { userId, weekStartDate, organizationId },
  });
  // Draft numbers are a snapshot; rebuild them on open so the tiles match the live task lists below.
  const stale =
    !!existing &&
    EDITABLE_REPORT_STATUSES.includes(existing.status) &&
    Date.now() - existing.updatedAt.getTime() > REFRESH_TTL_MS;
  const report = existing && !stale ? existing : await generateWeeklyReport(organizationId, userId, anyDateInWeek);

  const [completedTasks, overdueTasks] = await Promise.all([
    listCompletedTasksInRange(organizationId, userId, report.weekStartDate, report.weekEndDate),
    listOverdueTasksForUser(organizationId, userId),
  ]);

  const reviewer = report.reviewerId
    ? await prisma.user.findUnique({ where: { id: report.reviewerId }, select: { id: true, name: true } })
    : null;

  return { ...report, reviewer, completedTasks, overdueTasks };
}

/** Autosave while writing: only the owner, and only while the report can still be edited. */
export async function saveWeeklySummary(
  organizationId: string,
  actor: AuthUser,
  reportId: string,
  input: z.infer<typeof saveSummarySchema>
) {
  const report = await prisma.weeklyReport.findFirst({ where: { id: reportId, organizationId } });
  if (!report) throw AppError.notFound("Weekly report not found");
  if (report.userId !== actor.id) throw AppError.forbidden("You can only edit your own weekly report");
  if (!EDITABLE_REPORT_STATUSES.includes(report.status)) {
    throw AppError.conflict("This report has been submitted, so it can't be edited");
  }
  const updated = await prisma.weeklyReport.update({ where: { id: reportId }, data: { summary: input.summary } });
  return { id: updated.id, summary: updated.summary, updatedAt: updated.updatedAt };
}

export async function submitWeeklyReport(
  organizationId: string,
  actor: AuthUser,
  reportId: string,
  input: z.infer<typeof submitWeeklySchema>
) {
  const report = await prisma.weeklyReport.findFirst({ where: { id: reportId, organizationId } });
  if (!report) throw AppError.notFound("Weekly report not found");
  if (report.userId !== actor.id) throw AppError.forbidden("You can only submit your own weekly report");

  return prisma.weeklyReport.update({
    where: { id: reportId },
    data: {
      status: "SUBMITTED",
      summary: input.summary ?? report.summary,
      submittedAt: new Date(),
      // A resubmission goes back to the queue; the earlier review no longer applies.
      reviewerId: null,
      reviewedAt: null,
      managerComment: null,
    },
  });
}

export async function reviewWeeklyReport(
  organizationId: string,
  actor: AuthUser,
  reportId: string,
  input: z.infer<typeof reviewWeeklySchema>
) {
  const report = await prisma.weeklyReport.findFirst({ where: { id: reportId, organizationId } });
  if (!report) throw AppError.notFound("Weekly report not found");
  await assertCanReview(organizationId, actor, report.userId);

  if (report.status === "DRAFT") throw AppError.conflict("This report hasn't been submitted yet");

  const updated = await prisma.weeklyReport.update({
    where: { id: reportId },
    data: {
      status: input.status,
      managerComment: input.managerComment,
      reviewerId: actor.id,
      reviewedAt: new Date(),
    },
  });

  if (input.status === "CHANGES_REQUESTED") {
    await notifyUser({
      organizationId,
      userId: report.userId,
      type: "WEEKLY_REPORT_DUE",
      message: `${await actorName(actor.id)} sent your weekly report back${input.managerComment ? `: ${input.managerComment}` : " for changes"}`,
      relatedReportId: reportId,
      dedupeKey: `weekly-report-changes:${reportId}:${updated.reviewedAt?.getTime()}`,
      cooldownMs: 0,
    });
  }
  return updated;
}

/** Takes a review back (the Undo after approving or sending back), returning the report to the review queue. */
export async function undoWeeklyReview(organizationId: string, actor: AuthUser, reportId: string) {
  const report = await prisma.weeklyReport.findFirst({ where: { id: reportId, organizationId } });
  if (!report) throw AppError.notFound("Weekly report not found");
  await assertCanReview(organizationId, actor, report.userId);
  if (report.status !== "APPROVED" && report.status !== "CHANGES_REQUESTED") {
    throw AppError.conflict("There's no review to undo");
  }
  return prisma.weeklyReport.update({
    where: { id: reportId },
    data: { status: "SUBMITTED", managerComment: null, reviewerId: null, reviewedAt: null },
  });
}

async function actorName(userId: string): Promise<string> {
  return (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ?? "Your manager";
}

async function assertCanReview(organizationId: string, actor: AuthUser, reportOwnerId: string) {
  if (actor.role === "MANAGER") {
    const chain = await getReportingChainUp(organizationId, reportOwnerId);
    if (!chain.includes(actor.id)) throw AppError.forbidden("You can only review reports of your reporting chain");
  } else if (actor.role !== "ADMIN" && actor.role !== "OWNER") {
    throw AppError.forbidden("You do not have permission to review this report");
  }
}

/** How many submitted weekly reports (recent weeks) are waiting for this person's review; 0 for anyone who can't review. */
export async function countReportsAwaitingReview(organizationId: string, actor: AuthUser, now = new Date()) {
  if (actor.role === "EMPLOYEE") return 0;
  const userIds = await resolveTeamUserIds(organizationId, actor);
  return prisma.weeklyReport.count({
    where: {
      organizationId,
      status: "SUBMITTED",
      userId: userIds ? { in: userIds.filter((id) => id !== actor.id) } : { not: actor.id },
      weekStartDate: { gte: addDays(startOfWeek(now), -7 * 8) },
    },
  });
}

/** Reminds people who haven't submitted, using the same notification as the Monday reminder. */
export async function remindWeeklyReports(
  organizationId: string,
  actor: AuthUser,
  input: z.infer<typeof remindWeeklySchema>,
  anyDateInWeek: Date
) {
  const teamIds = await resolveTeamUserIds(organizationId, actor);
  const allowed = new Set(teamIds ?? (await prisma.user.findMany({ where: { organizationId, deletedAt: null }, select: { id: true } })).map((u) => u.id));
  const weekStartDate = startOfWeek(anyDateInWeek);
  let sent = 0;
  let skipped = 0;
  for (const userId of input.userIds) {
    if (!allowed.has(userId)) {
      skipped++;
      continue;
    }
    const report = await generateWeeklyReport(organizationId, userId, anyDateInWeek);
    // Only people who still owe the report; someone who submitted in the meantime isn't nagged.
    if (!EDITABLE_REPORT_STATUSES.includes(report.status) || report.status === "CHANGES_REQUESTED") {
      skipped++;
      continue;
    }
    const delivered = await notifyUser({
      organizationId,
      userId,
      type: "WEEKLY_REPORT_DUE",
      message: `${await actorName(actor.id)} reminded you to submit your weekly report for the week of ${weekStartDate.toDateString().slice(4, 10)}`,
      relatedReportId: report.id,
      dedupeKey: `weekly-report-remind:${userId}:${weekStartDate.getTime()}`,
      cooldownMs: 12 * 60 * 60 * 1000,
    });
    if (delivered) sent++;
    else skipped++;
  }
  return { sent, skipped };
}

/**
 * Who a team rollup may include: the whole org for owners/admins, a manager's
 * downline for managers. Anyone else has no team, so the rollup is forbidden
 * (it would otherwise list every colleague's report status and numbers).
 */
export async function resolveTeamUserIds(organizationId: string, actor: AuthUser): Promise<string[] | null> {
  if (actor.role === "OWNER" || actor.role === "ADMIN") return null;
  if (actor.role === "MANAGER") return getDownlineUserIds(organizationId, actor.id);
  throw AppError.forbidden("Only managers and admins can view team reports");
}

export async function weeklyTeamSummary(
  organizationId: string,
  actor: AuthUser,
  anyDateInWeek: Date,
  centerId?: string
) {
  const weekStartDate = startOfWeek(anyDateInWeek);
  const userIds = await resolveTeamUserIds(organizationId, actor);

  const users = await prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(userIds ? { id: { in: userIds } } : {}),
      ...(centerId ? { centerId } : {}),
    },
    select: { id: true, name: true, email: true, centerId: true },
  });

  const reports = await prisma.weeklyReport.findMany({
    where: { organizationId, weekStartDate, userId: { in: users.map((u) => u.id) } },
  });
  const byUser = new Map(reports.map((r) => [r.userId, r]));

  const now = new Date();
  const deadlinePassed = now > addDays(weekStartDate, 7);

  const doneKeys = await getStatusKeysByCategory(organizationId, ["DONE"]);
  const overdueCounts = await prisma.task.groupBy({
    by: ["assigneeId"],
    where: { organizationId, assigneeId: { in: users.map((u) => u.id) }, status: { notIn: doneKeys }, dueDate: { lt: now } },
    _count: { _all: true },
  });
  const overdueByUser = new Map(overdueCounts.map((o) => [o.assigneeId, o._count._all]));

  return users.map((user) => {
    const report = byUser.get(user.id);
    let status: "SUBMITTED" | "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "OVERDUE";
    if (!report || report.status === "DRAFT") {
      status = deadlinePassed ? "OVERDUE" : "PENDING";
    } else {
      status = report.status as any;
    }
    return { user, report: report ?? null, status, overdueTaskCount: overdueByUser.get(user.id) ?? 0 };
  });
}

export async function generateMonthlyReport(organizationId: string, userId: string, year: number, month: number) {
  const start = startOfMonth(year, month);
  const end = endOfMonth(year, month);

  const weeklyReports = await prisma.weeklyReport.findMany({
    where: { organizationId, userId, weekStartDate: { gte: start, lte: end } },
    orderBy: { weekStartDate: "asc" },
  });

  const overview = await getOverview(organizationId, { userIds: [userId] }, start, end);

  const tasksCompleted = overview.tasksCompleted;
  const tasksPlanned = overview.tasksCreated + overview.tasksOpen;
  const completionRate = tasksPlanned > 0 ? tasksCompleted / tasksPlanned : 0;

  let workingDays = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) workingDays += 1;
  }
  const hoursExpected = workingDays * 8;

  const wordFreq = new Map<string, number>();
  for (const wr of weeklyReports) {
    if (!wr.summary) continue;
    for (const raw of wr.summary.toLowerCase().split(/[^a-z0-9']+/)) {
      const word = raw.trim();
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }
  const topBlockers = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  return prisma.monthlyReport.upsert({
    where: { userId_year_month: { userId, year, month } },
    update: {
      tasksPlanned,
      tasksCompleted,
      completionRate,
      hoursLogged: overview.hoursLoggedTotal,
      daysLogged: overview.hoursByDay.length,
      hoursExpected,
      weeklyBreakdownJson: weeklyReports.map((wr) => ({
        weekStartDate: wr.weekStartDate,
        tasksCompleted: wr.tasksCompleted,
        hoursLogged: wr.hoursLogged,
      })),
      topBlockersJson: topBlockers,
      generatedAt: new Date(),
    },
    create: {
      organizationId,
      userId,
      year,
      month,
      tasksPlanned,
      tasksCompleted,
      completionRate,
      hoursLogged: overview.hoursLoggedTotal,
      daysLogged: overview.hoursByDay.length,
      hoursExpected,
      weeklyBreakdownJson: weeklyReports.map((wr) => ({
        weekStartDate: wr.weekStartDate,
        tasksCompleted: wr.tasksCompleted,
        hoursLogged: wr.hoursLogged,
      })),
      topBlockersJson: topBlockers,
    },
  });
}

async function getMonthlyReportRecord(organizationId: string, userId: string, year: number, month: number) {
  // Scoped by organizationId in addition to the unique key — see getWeeklyReport above.
  const existing = await prisma.monthlyReport.findFirst({ where: { userId, year, month, organizationId } });
  if (!existing) return generateMonthlyReport(organizationId, userId, year, month);
  // A report saved while its month was still running is out of date — rebuild it until it has been
  // generated after the month ended, at which point it's final.
  const generatedWhileInProgress = existing.generatedAt.getTime() <= endOfMonth(year, month).getTime();
  if (generatedWhileInProgress && Date.now() - existing.generatedAt.getTime() > REFRESH_TTL_MS) {
    return generateMonthlyReport(organizationId, userId, year, month);
  }
  return existing;
}

export async function getMonthlyReport(organizationId: string, userId: string, year: number, month: number) {
  const report = await getMonthlyReportRecord(organizationId, userId, year, month);

  const [completedTasks, overdueTasks] = await Promise.all([
    listCompletedTasksInRange(organizationId, userId, startOfMonth(year, month), endOfMonth(year, month)),
    listOverdueTasksForUser(organizationId, userId),
  ]);

  return { ...report, completedTasks, overdueTasks };
}

export async function monthlyTeamSummary(
  organizationId: string,
  actor: AuthUser,
  year: number,
  month: number,
  centerId?: string,
  departmentId?: string
) {
  const userIds = await resolveTeamUserIds(organizationId, actor);

  const users = await prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(userIds ? { id: { in: userIds } } : {}),
      ...(centerId ? { centerId } : {}),
      ...(departmentId ? { departmentId } : {}),
    },
    select: { id: true, name: true, centerId: true, departmentId: true },
  });

  const reports = await Promise.all(
    users.map((u) => getMonthlyReportRecord(organizationId, u.id, year, month).then((r) => ({ user: u, report: r })))
  );

  const updatedAt = reports.length ? new Date(Math.min(...reports.map((r) => r.report.generatedAt.getTime()))) : null;
  return { ...rankMonthlyTeam(reports), updatedAt };
}

export const AT_RISK_BELOW = 0.5;

/**
 * Splits a team into top performers and at-risk people — never both. People with no planned
 * tasks have nothing to measure, so they sit in neither list and don't drag the average to 0%.
 */
export function rankMonthlyTeam<T extends { report: { tasksPlanned: number; completionRate: number } }>(entries: T[]) {
  const measurable = entries.filter((e) => e.report.tasksPlanned > 0);
  const byRateDesc = [...measurable].sort((a, b) => b.report.completionRate - a.report.completionRate);
  const avgCompletionRate = measurable.length
    ? measurable.reduce((sum, e) => sum + e.report.completionRate, 0) / measurable.length
    : null;
  return {
    avgCompletionRate,
    topPerformers: byRateDesc.filter((e) => e.report.completionRate >= AT_RISK_BELOW).slice(0, 5),
    atRisk: byRateDesc.filter((e) => e.report.completionRate < AT_RISK_BELOW).reverse().slice(0, 10),
    // Everyone, best first, with the unmeasurable at the end.
    all: [...byRateDesc, ...entries.filter((e) => e.report.tasksPlanned === 0)],
  };
}
