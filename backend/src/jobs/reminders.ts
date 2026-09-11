import { prisma } from "../lib/prisma.js";
import { notifyUser } from "../lib/notify.js";
import { dateKey } from "../lib/dates.js";

const DUE_SOON_LEAD_MS = 24 * 60 * 60 * 1000; // 1 day before due date
const NO_LOG_DAYS_THRESHOLD = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function scanTaskReminders() {
  const now = new Date();

  const dueSoon = await prisma.task.findMany({
    where: {
      status: { notIn: ["DONE"] },
      assigneeId: { not: null },
      dueDate: { gte: now, lte: new Date(now.getTime() + DUE_SOON_LEAD_MS) },
    },
    select: { id: true, title: true, organizationId: true, assigneeId: true, dueDate: true },
  });
  for (const task of dueSoon) {
    await notifyUser({
      organizationId: task.organizationId,
      userId: task.assigneeId!,
      type: "TASK_DUE_SOON",
      message: `"${task.title}" is due soon (${task.dueDate?.toISOString().slice(0, 10)})`,
      relatedTaskId: task.id,
      dedupeKey: `due-soon:${task.id}`,
      cooldownMs: DAY_MS,
    });
  }

  const overdue = await prisma.task.findMany({
    where: {
      status: { notIn: ["DONE"] },
      assigneeId: { not: null },
      dueDate: { lt: now },
    },
    select: { id: true, title: true, organizationId: true, assigneeId: true },
  });
  for (const task of overdue) {
    await notifyUser({
      organizationId: task.organizationId,
      userId: task.assigneeId!,
      type: "TASK_OVERDUE",
      message: `"${task.title}" is overdue`,
      relatedTaskId: task.id,
      dedupeKey: `overdue:${task.id}:${dateKey(now)}`,
      cooldownMs: DAY_MS,
    });
  }

  const activeTasks = await prisma.task.findMany({
    where: { status: { in: ["IN_PROGRESS", "ONGOING"] }, assigneeId: { not: null } },
    select: { id: true, title: true, organizationId: true, assigneeId: true },
  });
  const cutoff = new Date(now.getTime() - NO_LOG_DAYS_THRESHOLD * DAY_MS);
  for (const task of activeTasks) {
    const recentLog = await prisma.taskLog.findFirst({
      where: { taskId: task.id, userId: task.assigneeId!, date: { gte: cutoff } },
    });
    if (recentLog) continue;
    await notifyUser({
      organizationId: task.organizationId,
      userId: task.assigneeId!,
      type: "NO_TIME_LOGGED",
      message: `No time logged on "${task.title}" for ${NO_LOG_DAYS_THRESHOLD}+ days`,
      relatedTaskId: task.id,
      dedupeKey: `no-log:${task.id}:${dateKey(now)}`,
      cooldownMs: DAY_MS,
    });
  }
}
