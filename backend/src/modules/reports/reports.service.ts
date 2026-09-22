import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { AuthUser } from "../../plugins/auth.js";
import { getOverview } from "../overview/overview.service.js";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from "../../lib/dates.js";
import { getDownlineUserIds, getReportingChainUp } from "../../lib/hierarchy.js";
import { getStatusKeysByCategory } from "../../lib/taskStatuses.js";
import { z } from "zod";
import { submitWeeklySchema, reviewWeeklySchema } from "./reports.schemas.js";

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

export async function generateWeeklyReport(organizationId: string, userId: string, anyDateInWeek: Date) {
  const weekStartDate = startOfWeek(anyDateInWeek);
  const weekEndDate = endOfWeek(anyDateInWeek);

  const overview = await getOverview(organizationId, { userIds: [userId] }, weekStartDate, weekEndDate);

  const existing = await prisma.weeklyReport.findUnique({
    where: { userId_weekStartDate: { userId, weekStartDate } },
  });
  if (existing && existing.status !== "DRAFT") return existing;

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

export async function getWeeklyReport(organizationId: string, userId: string, anyDateInWeek: Date) {
  const weekStartDate = startOfWeek(anyDateInWeek);
  const existing = await prisma.weeklyReport.findUnique({
    where: { userId_weekStartDate: { userId, weekStartDate } },
  });
  const report = existing ?? (await generateWeeklyReport(organizationId, userId, anyDateInWeek));

  const [completedTasks, overdueTasks] = await Promise.all([
    listCompletedTasksInRange(organizationId, userId, report.weekStartDate, report.weekEndDate),
    listOverdueTasksForUser(organizationId, userId),
  ]);

  return { ...report, completedTasks, overdueTasks };
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
    data: { status: "SUBMITTED", summary: input.summary ?? report.summary, submittedAt: new Date() },
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

  if (actor.role === "MANAGER") {
    const chain = await getReportingChainUp(organizationId, report.userId);
    if (!chain.includes(actor.id)) throw AppError.forbidden("You can only review reports of your reporting chain");
  } else if (actor.role !== "ADMIN" && actor.role !== "OWNER") {
    throw AppError.forbidden("You do not have permission to review this report");
  }

  return prisma.weeklyReport.update({
    where: { id: reportId },
    data: {
      status: input.status,
      managerComment: input.managerComment,
      reviewerId: actor.id,
      reviewedAt: new Date(),
    },
  });
}

export async function weeklyTeamSummary(
  organizationId: string,
  actor: AuthUser,
  anyDateInWeek: Date,
  centerId?: string
) {
  const weekStartDate = startOfWeek(anyDateInWeek);

  let userIds: string[] | null = null;
  if (actor.role === "MANAGER") {
    userIds = await getDownlineUserIds(organizationId, actor.id);
  }

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
  const existing = await prisma.monthlyReport.findUnique({ where: { userId_year_month: { userId, year, month } } });
  return existing ?? generateMonthlyReport(organizationId, userId, year, month);
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
  let userIds: string[] | null = null;
  if (actor.role === "MANAGER") {
    userIds = await getDownlineUserIds(organizationId, actor.id);
  }

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

  const avgCompletionRate =
    reports.length > 0 ? reports.reduce((sum, r) => sum + r.report.completionRate, 0) / reports.length : 0;

  const ranked = [...reports].sort((a, b) => b.report.completionRate - a.report.completionRate);
  const topPerformers = ranked.slice(0, 5);
  const atRisk = ranked.filter((r) => r.report.completionRate < 0.5).slice(0, 10);

  return { avgCompletionRate, topPerformers, atRisk, all: reports };
}
