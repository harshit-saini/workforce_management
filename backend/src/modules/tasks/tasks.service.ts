import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { AuthUser } from "../../plugins/auth.js";
import { paginationMeta, toSkipTake } from "../../lib/pagination.js";
import { z } from "zod";
import { createTaskSchema, updateTaskSchema, listTasksQuerySchema, addCommentSchema, logTimeSchema } from "./tasks.schemas.js";
import { Prisma } from "@prisma/client";

const taskInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true } },
  center: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  tags: true,
  watchers: { include: { user: { select: { id: true, name: true } } } },
  subtasks: {
    select: { id: true, title: true, status: true, assigneeId: true, dueDate: true },
  },
  parentTask: { select: { id: true, title: true, status: true } },
  attachments: {
    where: { commentId: null },
    orderBy: { createdAt: "desc" },
  },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskInclude;

export function scopeWhere(accessibleUserIds: string[] | null): Prisma.TaskWhereInput {
  if (accessibleUserIds === null) return {};
  return {
    OR: [
      { assigneeId: { in: accessibleUserIds } },
      { createdById: { in: accessibleUserIds } },
      { watchers: { some: { userId: { in: accessibleUserIds } } } },
    ],
  };
}

export async function listTasks(
  organizationId: string,
  accessibleUserIds: string[] | null,
  query: z.infer<typeof listTasksQuerySchema>
) {
  const where: Prisma.TaskWhereInput = {
    organizationId,
    AND: [scopeWhere(accessibleUserIds)],
    ...(query.status ? { status: query.status } : {}),
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
    ...(query.centerId ? { centerId: query.centerId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.parentTaskId ? { parentTaskId: query.parentTaskId } : {}),
    ...(query.topLevelOnly ? { parentTaskId: null } : {}),
    ...(query.tag ? { tags: { some: { label: query.tag } } } : {}),
    ...(query.dueBefore || query.dueAfter
      ? {
          dueDate: {
            ...(query.dueBefore ? { lte: query.dueBefore } : {}),
            ...(query.dueAfter ? { gte: query.dueAfter } : {}),
          },
        }
      : {}),
    ...(query.search
      ? { OR: [{ title: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] }
      : {}),
    ...(query.view === "backlog" ? { status: "BACKLOG" } : {}),
    ...(query.view === "ongoing" ? { isRecurring: true } : {}),
    ...(query.view === "board" ? { isRecurring: false } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      ...toSkipTake(query.page, query.pageSize),
    }),
    prisma.task.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, query.page, query.pageSize) };
}

export async function getTaskOrThrow(organizationId: string, accessibleUserIds: string[] | null, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId, AND: [scopeWhere(accessibleUserIds)] },
    include: taskInclude,
  });
  if (!task) throw AppError.notFound("Task not found");
  return task;
}

async function assertAssigneeInScope(
  organizationId: string,
  actor: AuthUser,
  accessibleUserIds: string[] | null,
  assigneeId?: string | null
) {
  if (!assigneeId) return;
  if (accessibleUserIds === null) return; // admin/owner: unrestricted
  if (!accessibleUserIds.includes(assigneeId)) {
    throw AppError.forbidden("You cannot assign tasks outside your reporting scope or center");
  }
}

export async function createTask(
  organizationId: string,
  actor: AuthUser,
  accessibleUserIds: string[] | null,
  input: z.infer<typeof createTaskSchema>
) {
  await assertAssigneeInScope(organizationId, actor, accessibleUserIds, input.assigneeId);

  let centerId = input.centerId;
  if (!centerId && input.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: input.assigneeId } });
    centerId = assignee?.centerId ?? undefined;
  }
  if (!centerId) centerId = actor.centerId ?? undefined;

  let parentDepartmentId = input.departmentId;
  if (input.parentTaskId) {
    const parent = await prisma.task.findFirst({ where: { id: input.parentTaskId, organizationId } });
    if (!parent) throw AppError.notFound("Parent task not found");
    if (!parentDepartmentId) parentDepartmentId = parent.departmentId ?? undefined;
  }

  const task = await prisma.task.create({
    data: {
      organizationId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      isRecurring: input.isRecurring,
      assigneeId: input.assigneeId,
      createdById: actor.id,
      centerId,
      departmentId: parentDepartmentId,
      parentTaskId: input.parentTaskId,
      dueDate: input.dueDate,
      estimatedHours: input.estimatedHours,
      tags: { create: input.tags.map((label) => ({ label })) },
      watchers: { create: input.watcherIds.map((userId) => ({ userId })) },
    },
    include: taskInclude,
  });

  await prisma.taskActivity.create({
    data: {
      taskId: task.id,
      userId: actor.id,
      type: "CREATED",
      message: `Created task "${task.title}"`,
    },
  });

  if (input.assigneeId && input.assigneeId !== actor.id) {
    await prisma.notification.create({
      data: {
        organizationId,
        userId: input.assigneeId,
        type: "TASK_ASSIGNED",
        relatedTaskId: task.id,
        message: `You were assigned to "${task.title}"`,
      },
    });
  }

  return task;
}

export async function updateTask(
  organizationId: string,
  actor: AuthUser,
  accessibleUserIds: string[] | null,
  taskId: string,
  input: z.infer<typeof updateTaskSchema>
) {
  const existing = await getTaskOrThrow(organizationId, accessibleUserIds, taskId);

  if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
    await assertAssigneeInScope(organizationId, actor, accessibleUserIds, input.assigneeId);
  }

  const { tags, watcherIds, ...rest } = input;

  const data: Prisma.TaskUpdateInput = { ...rest };
  if (rest.status === "DONE" && existing.status !== "DONE") data.completedAt = new Date();
  if (rest.status && rest.status !== "DONE") data.completedAt = null;

  const updated = await prisma.$transaction(async (tx) => {
    if (tags) {
      await tx.taskTag.deleteMany({ where: { taskId } });
      await tx.taskTag.createMany({ data: tags.map((label) => ({ taskId, label })) });
    }
    if (watcherIds) {
      await tx.taskWatcher.deleteMany({ where: { taskId } });
      await tx.taskWatcher.createMany({ data: watcherIds.map((userId) => ({ taskId, userId })) });
    }

    const task = await tx.task.update({ where: { id: taskId }, data, include: taskInclude });

    if (input.assigneeId !== undefined && input.assigneeId !== existing.assigneeId) {
      await tx.taskActivity.create({
        data: {
          taskId,
          userId: actor.id,
          type: "REASSIGNED",
          message: `Reassigned from ${existing.assignee?.name ?? "unassigned"} to ${task.assignee?.name ?? "unassigned"}`,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          action: "TASK_REASSIGNED",
          actorId: actor.id,
          metadata: { taskId, from: existing.assigneeId, to: input.assigneeId },
        },
      });
      if (input.assigneeId) {
        await tx.notification.create({
          data: {
            organizationId,
            userId: input.assigneeId,
            type: "TASK_ASSIGNED",
            relatedTaskId: taskId,
            message: `You were assigned to "${task.title}"`,
          },
        });
      }
    } else {
      const changedFields = Object.keys(rest).filter((k) => k !== "status");
      if (changedFields.length > 0) {
        await tx.taskActivity.create({
          data: { taskId, userId: actor.id, type: "EDITED", message: `Updated ${changedFields.join(", ")}` },
        });
      }
    }

    return task;
  });

  return updated;
}

export async function deleteTask(organizationId: string, accessibleUserIds: string[] | null, taskId: string) {
  await getTaskOrThrow(organizationId, accessibleUserIds, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}

export async function addComment(
  organizationId: string,
  actor: AuthUser,
  accessibleUserIds: string[] | null,
  taskId: string,
  input: z.infer<typeof addCommentSchema>
) {
  const task = await getTaskOrThrow(organizationId, accessibleUserIds, taskId);

  const result = await prisma.$transaction(async (tx) => {
    const comment = await tx.taskComment.create({
      data: {
        taskId,
        userId: actor.id,
        comment: input.comment,
        statusChangedTo: input.statusChangedTo,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    if (input.statusChangedTo && input.statusChangedTo !== task.status) {
      const data: Prisma.TaskUpdateInput = { status: input.statusChangedTo };
      if (input.statusChangedTo === "DONE") data.completedAt = new Date();
      if (task.status === "DONE" && input.statusChangedTo !== "DONE") data.completedAt = null;
      await tx.task.update({ where: { id: taskId }, data });
    }

    for (const watcher of task.watchers) {
      if (watcher.userId === actor.id) continue;
      await tx.notification.create({
        data: {
          organizationId,
          userId: watcher.userId,
          type: "COMMENT_MENTION",
          relatedTaskId: taskId,
          message: `New activity on "${task.title}": ${input.comment.slice(0, 140)}`,
        },
      });
    }

    return comment;
  });

  return result;
}

export async function logTime(
  organizationId: string,
  actor: AuthUser,
  accessibleUserIds: string[] | null,
  taskId: string,
  input: z.infer<typeof logTimeSchema>
) {
  await getTaskOrThrow(organizationId, accessibleUserIds, taskId);

  const log = await prisma.taskLog.upsert({
    where: { taskId_userId_date: { taskId, userId: actor.id, date: input.date } },
    update: { hoursLogged: input.hoursLogged, note: input.note },
    create: { taskId, userId: actor.id, date: input.date, hoursLogged: input.hoursLogged, note: input.note },
  });

  await prisma.taskActivity.create({
    data: {
      taskId,
      userId: actor.id,
      type: "TIME_LOGGED",
      message: `Logged ${input.hoursLogged}h on ${input.date.toISOString().slice(0, 10)}`,
    },
  });

  return log;
}

export async function getActivity(organizationId: string, accessibleUserIds: string[] | null, taskId: string) {
  await getTaskOrThrow(organizationId, accessibleUserIds, taskId);

  const [comments, activities] = await Promise.all([
    prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } }, attachments: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.taskActivity.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return [
    ...comments.map((c) => ({ kind: "comment" as const, ...c })),
    ...activities.map((a) => ({ kind: "activity" as const, ...a })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
