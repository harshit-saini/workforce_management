import { prisma } from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { addDays, dateKey, startOfDay } from "../../lib/dates.js";
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

export interface OverviewExtras {
  /** Not finished and due before today — the same rule as the Tasks page's Overdue chip. */
  tasksOverdue: number;
  /** Of the tasks created in the range, how many are done now. */
  createdDone: number;
  /** Every day of the range, days with no hours included. */
  hoursPerDay: { date: string; hours: number }[];
  /** The same measures for the period of equal length just before, and how many tasks were open / overdue at its end. */
  previous: {
    label: string;
    tasksCreated: number;
    tasksCompleted: number;
    hoursLogged: number;
    tasksOpen: number;
    tasksOverdue: number;
  };
}

/** The extra numbers the dashboard needs: overdue, a per-day hours series, and last period for comparison. */
export async function getOverviewExtras(
  organizationId: string,
  scope: OverviewScope,
  startDate: Date,
  endDate: Date,
  hoursByDay: { date: string; hours: number }[]
): Promise<OverviewExtras> {
  const where = baseTaskWhere(organizationId, scope);
  const doneKeys = await getStatusKeysByCategory(organizationId, ["DONE"]);

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs));
  const prevStart = addDays(startDate, -days);
  const prevEnd = new Date(startDate.getTime() - 1);
  const todayStart = startOfDay(new Date());

  const logWhere = (from: Date, to: Date): Prisma.TaskLogWhereInput => ({
    date: { gte: from, lte: to },
    ...(scope.userIds ? { userId: { in: scope.userIds } } : {}),
    task: {
      organizationId,
      ...(scope.centerId ? { centerId: scope.centerId } : {}),
      ...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
    },
  });
  // A task counted as open at the end of the previous period if it existed then and wasn't finished by then.
  const openThen: Prisma.TaskWhereInput = {
    ...where,
    createdAt: { lte: prevEnd },
    OR: [{ status: { notIn: doneKeys } }, { completedAt: { gt: prevEnd } }],
  };

  const [tasksOverdue, createdDone, prevCreated, prevCompleted, prevHours, prevOpen, prevOverdue] = await Promise.all([
    prisma.task.count({ where: { ...where, status: { notIn: doneKeys }, dueDate: { lt: todayStart } } }),
    prisma.task.count({ where: { ...where, createdAt: { gte: startDate, lte: endDate }, status: { in: doneKeys } } }),
    prisma.task.count({ where: { ...where, createdAt: { gte: prevStart, lte: prevEnd } } }),
    prisma.task.count({ where: { ...where, status: { in: doneKeys }, completedAt: { gte: prevStart, lte: prevEnd } } }),
    prisma.taskLog.aggregate({ where: logWhere(prevStart, prevEnd), _sum: { hoursLogged: true } }),
    prisma.task.count({ where: openThen }),
    prisma.task.count({ where: { ...openThen, dueDate: { lt: startOfDay(prevEnd) } } }),
  ]);

  // Walk the range by UTC calendar day, the same way log dates are keyed.
  const byDay = new Map(hoursByDay.map((d) => [d.date, d.hours]));
  const hoursPerDay: { date: string; hours: number }[] = [];
  const last = dateKey(endDate);
  for (let cursor = new Date(`${dateKey(startDate)}T00:00:00Z`); dateKey(cursor) <= last; cursor = new Date(cursor.getTime() + dayMs)) {
    const key = dateKey(cursor);
    hoursPerDay.push({ date: key, hours: byDay.get(key) ?? 0 });
  }

  return {
    tasksOverdue,
    createdDone,
    hoursPerDay,
    previous: {
      label: days === 7 ? "last week" : `the previous ${days} ${days === 1 ? "day" : "days"}`,
      tasksCreated: prevCreated,
      tasksCompleted: prevCompleted,
      hoursLogged: prevHours._sum.hoursLogged ?? 0,
      tasksOpen: prevOpen,
      tasksOverdue: prevOverdue,
    },
  };
}
