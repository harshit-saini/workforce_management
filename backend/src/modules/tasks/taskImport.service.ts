import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { AuthUser } from "../../plugins/auth.js";
import { listStatusOptions } from "../../lib/taskStatuses.js";
import { buildTaskListWhere, TaskListFilters } from "./tasks.service.js";
import {
  ImportLookups,
  ImportRow,
  PRIORITY_LABELS,
  ValidatedImportRow,
  buildExportWorkbook,
  buildTemplateWorkbook,
  readTaskSheet,
  summarizeValidation,
  validateImportRow,
} from "./taskSheet.js";

const MAX_EXPORT_ROWS = 20_000;

async function loadOrgData(organizationId: string) {
  const [users, centers, departments, statuses] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true, email: true, centerId: true },
      orderBy: { name: "asc" },
    }),
    prisma.center.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listStatusOptions(organizationId),
  ]);

  // Imported tasks are regular (non-recurring) tasks, so — like the New Task form — the
  // "ongoing/recurring" status isn't offered.
  const taskStatuses = statuses.filter((s) => !s.isRecurringDefault);
  const defaultStatus = taskStatuses.find((s) => s.isDefault) ?? taskStatuses[0];
  if (!defaultStatus) throw AppError.badRequest("Your organization has no task statuses configured");

  return { users, centers, departments, statuses, taskStatuses, defaultStatus };
}

function toLookups(data: Awaited<ReturnType<typeof loadOrgData>>): ImportLookups {
  const lookups: ImportLookups = {
    users: new Map(data.users.map((u) => [u.email.toLowerCase(), u])),
    centers: new Map(),
    departments: new Map(data.departments.map((d) => [d.name.toLowerCase(), d])),
    statuses: new Map(),
    defaultStatus: data.defaultStatus,
  };
  for (const center of data.centers) {
    lookups.centers.set(center.code.toLowerCase(), center);
    lookups.centers.set(center.name.toLowerCase(), center);
  }
  for (const status of data.taskStatuses) {
    lookups.statuses.set(status.key.toLowerCase(), status);
    lookups.statuses.set(status.label.toLowerCase(), status);
  }
  return lookups;
}

function validationResponse(validated: ValidatedImportRow[]) {
  return {
    rows: validated.map(({ rowNumber, assigneeName, issues }) => ({ rowNumber, assigneeName, issues })),
    summary: summarizeValidation(validated),
  };
}

/** Everything the import grid's dropdowns need, unpaginated so large orgs get complete lists. */
export async function getImportOptions(organizationId: string) {
  const data = await loadOrgData(organizationId);
  return {
    users: data.users.map(({ id, name, email }) => ({ id, name, email })),
    centers: data.centers,
    departments: data.departments,
    statuses: data.taskStatuses.map(({ key, label, color }) => ({ key, label, color })),
    priorities: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
    defaultStatus: { key: data.defaultStatus.key, label: data.defaultStatus.label },
  };
}

export async function previewImport(organizationId: string, buffer: Buffer) {
  const rows = await readTaskSheet(buffer);
  if (rows.length === 0) throw AppError.badRequest("No task rows found. Fill in at least one row below the header.");

  const lookups = toLookups(await loadOrgData(organizationId));
  const validated = rows.map((row) => validateImportRow(row, lookups));
  return { rows: validated.map((v) => v.normalized), validation: validationResponse(validated) };
}

export async function validateImport(organizationId: string, rows: ImportRow[]) {
  const lookups = toLookups(await loadOrgData(organizationId));
  return validationResponse(rows.map((row) => validateImportRow(row, lookups)));
}

/**
 * Re-validates server-side (the grid's state is never trusted) and creates every task in one
 * transaction — either all rows are imported or none are.
 */
export async function commitImport(organizationId: string, actor: AuthUser, rows: ImportRow[]) {
  const lookups = toLookups(await loadOrgData(organizationId));
  const validated = rows.map((row) => validateImportRow(row, lookups));
  const summary = summarizeValidation(validated);
  if (summary.errorRows > 0) return { created: 0, validation: validationResponse(validated) };

  const now = new Date();
  const tasks: Prisma.TaskCreateManyInput[] = [];
  const tags: Prisma.TaskTagCreateManyInput[] = [];
  const activities: Prisma.TaskActivityCreateManyInput[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];

  for (const { task } of validated) {
    if (!task) continue;
    // Ids are generated here so tags/activities/notifications can reference the tasks in the same batch.
    const id = randomUUID();
    tasks.push({
      id,
      organizationId,
      title: task.title,
      description: task.description,
      status: task.statusKey,
      priority: task.priority,
      isRecurring: false,
      assigneeId: task.assigneeId,
      createdById: actor.id,
      centerId: task.centerId,
      departmentId: task.departmentId,
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours,
      completedAt: task.statusCategory === "DONE" ? now : null,
    });
    tags.push(...task.tags.map((label) => ({ taskId: id, label })));
    activities.push({ taskId: id, userId: actor.id, type: "CREATED", message: `Created task "${task.title}" via bulk import` });
    if (task.assigneeId && task.assigneeId !== actor.id) {
      notifications.push({
        organizationId,
        userId: task.assigneeId,
        type: "TASK_ASSIGNED",
        relatedTaskId: id,
        message: `You were assigned to "${task.title}"`,
      });
    }
  }

  await prisma.$transaction([
    prisma.task.createMany({ data: tasks }),
    prisma.taskTag.createMany({ data: tags }),
    prisma.taskActivity.createMany({ data: activities }),
    prisma.notification.createMany({ data: notifications }),
  ]);

  return { created: tasks.length, validation: validationResponse(validated) };
}

export async function buildImportTemplate(organizationId: string) {
  const data = await loadOrgData(organizationId);
  return buildTemplateWorkbook({
    emails: data.users.map((u) => u.email),
    centers: data.centers.map((c) => c.name),
    departments: data.departments.map((d) => d.name),
    statuses: data.taskStatuses.map((s) => s.label),
  });
}

export async function exportTasks(organizationId: string, filters: TaskListFilters) {
  const where = await buildTaskListWhere(organizationId, null, filters);
  const count = await prisma.task.count({ where });
  if (count > MAX_EXPORT_ROWS) {
    throw AppError.badRequest(`That's ${count} tasks — exports are limited to ${MAX_EXPORT_ROWS}. Narrow the filters and try again.`);
  }

  const [tasks, statuses] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignee: { select: { name: true, email: true } },
        center: { select: { name: true } },
        department: { select: { name: true } },
        createdBy: { select: { name: true } },
        parentTask: { select: { title: true } },
        tags: { select: { label: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    listStatusOptions(organizationId),
  ]);
  const statusLabel = new Map(statuses.map((s) => [s.key, s.label]));

  return buildExportWorkbook(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      assigneeEmail: t.assignee?.email ?? null,
      assigneeName: t.assignee?.name ?? null,
      center: t.center?.name ?? null,
      department: t.department?.name ?? null,
      status: statusLabel.get(t.status) ?? t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      tags: t.tags.map((tag) => tag.label),
      parentTask: t.parentTask?.title ?? null,
      createdBy: t.createdBy.name,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
    }))
  );
}
