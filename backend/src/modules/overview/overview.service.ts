import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { dateKey } from "../../lib/dates.js";
import { getStatusKeysByCategory } from "../../lib/taskStatuses.js";

export interface OverviewScope {
  userIds?: string[] | null;
  centerId?: string;
  departmentId?: string;
}

function baseTaskWhere(organizationId: string, scope: OverviewScope): Prisma.TaskWhereInput {
  return {
    organizationId,
    ...(scope.userIds ? { assigneeId: { in: scope.userIds } } : {}),
    ...(scope.centerId ? { centerId: scope.centerId } : {}),
    ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
  };
}

export interface OverviewResult {
  range: { startDate: string; endDate: string };
  tasksCreated: number;
  tasksCompleted: number;
  tasksOpen: number;
  tasksBlocked: number;
  hoursLoggedTotal: number;
  hoursByDay: { date: string; hours: number }[];
  subtaskCompletion: { total: number; done: number };
  activityTimeline: {
    id: string;
    taskId: string;
    taskTitle: string;
    userId: string;
    userName: string;
    type: string;
    message: string;
    createdAt: string;
  }[];
  completedByDay: { date: string; count: number }[];
}

export async function getOverview(
  organizationId: string,
  scope: OverviewScope,
  startDate: Date,
  endDate: Date
): Promise<OverviewResult> {
  const where = baseTaskWhere(organizationId, scope);
  const [doneKeys, blockedKeys] = await Promise.all([
    getStatusKeysByCategory(organizationId, ["DONE"]),
    getStatusKeysByCategory(organizationId, ["BLOCKED"]),
  ]);

  const [tasksCreated, tasksCompletedTasks, tasksOpen, tasksBlocked, logs, subtaskAgg, comments, activities] =
    await Promise.all([
      prisma.task.count({ where: { ...where, createdAt: { gte: startDate, lte: endDate } } }),
      prisma.task.findMany({
        where: { ...where, status: { in: doneKeys }, completedAt: { gte: startDate, lte: endDate } },
        select: { id: true, completedAt: true },
      }),
      prisma.task.count({ where: { ...where, status: { notIn: doneKeys } } }),
      prisma.task.count({ where: { ...where, status: { in: blockedKeys } } }),
      prisma.taskLog.findMany({
        where: {
          date: { gte: startDate, lte: endDate },
          ...(scope.userIds ? { userId: { in: scope.userIds } } : {}),
          task: {
            organizationId,
            ...(scope.centerId ? { centerId: scope.centerId } : {}),
            ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
          },
        },
        select: { hoursLogged: true, date: true },
      }),
      prisma.task.aggregate({
        where: { ...where, parentTaskId: { not: null } },
        _count: { _all: true },
      }),
      prisma.taskComment.findMany({
        where: { createdAt: { gte: startDate, lte: endDate }, task: where },
        select: {
          id: true,
          taskId: true,
          comment: true,
          statusChangedTo: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          task: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.taskActivity.findMany({
        where: { createdAt: { gte: startDate, lte: endDate }, task: where },
        select: {
          id: true,
          taskId: true,
          type: true,
          message: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          task: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

  const subtaskTotal = subtaskAgg._count._all;
  const subtaskDone = await prisma.task.count({
    where: { ...where, parentTaskId: { not: null }, status: { in: doneKeys } },
  });

  const hoursByDayMap = new Map<string, number>();
  let hoursLoggedTotal = 0;
  for (const log of logs) {
    const key = dateKey(log.date);
    hoursByDayMap.set(key, (hoursByDayMap.get(key) ?? 0) + log.hoursLogged);
    hoursLoggedTotal += log.hoursLogged;
  }

  const completedByDayMap = new Map<string, number>();
  for (const t of tasksCompletedTasks) {
    if (!t.completedAt) continue;
    const key = dateKey(t.completedAt);
    completedByDayMap.set(key, (completedByDayMap.get(key) ?? 0) + 1);
  }

  const activityTimeline = [
    ...comments.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      taskTitle: c.task.title,
      userId: c.user.id,
      userName: c.user.name,
      type: c.statusChangedTo ? "STATUS_CHANGE" : "COMMENT",
      message: c.statusChangedTo ? `Moved to ${c.statusChangedTo} — ${c.comment}` : c.comment,
      createdAt: c.createdAt.toISOString(),
    })),
    ...activities.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      taskTitle: a.task.title,
      userId: a.user.id,
      userName: a.user.name,
      type: a.type,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 100);

  return {
    range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    tasksCreated,
    tasksCompleted: tasksCompletedTasks.length,
    tasksOpen,
    tasksBlocked,
    hoursLoggedTotal,
    hoursByDay: Array.from(hoursByDayMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, hours]) => ({ date, hours })),
    subtaskCompletion: { total: subtaskTotal, done: subtaskDone },
    activityTimeline,
    completedByDay: Array.from(completedByDayMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, count]) => ({ date, count })),
  };
}
