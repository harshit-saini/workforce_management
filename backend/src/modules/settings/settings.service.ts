import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { z } from "zod";
import { createStatusSchema, updateStatusSchema, reorderStatusesSchema, updateOrganizationSchema } from "./settings.schemas.js";
import { listStatusOptions } from "../../lib/taskStatuses.js";

function slugifyKey(label: string): string {
  return (
    label
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "") || "STATUS"
  );
}

async function uniqueKey(organizationId: string, base: string): Promise<string> {
  const key = slugifyKey(base);
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = suffix === 0 ? key : `${key}_${suffix}`;
    const existing = await prisma.taskStatusOption.findUnique({
      where: { organizationId_key: { organizationId, key: candidate } },
    });
    if (!existing) return candidate;
    suffix += 1;
  }
}

export async function listTaskStatuses(organizationId: string) {
  return listStatusOptions(organizationId);
}

export async function createTaskStatus(organizationId: string, input: z.infer<typeof createStatusSchema>) {
  const key = await uniqueKey(organizationId, input.label);
  const maxOrder = await prisma.taskStatusOption.aggregate({
    where: { organizationId },
    _max: { order: true },
  });

  return prisma.taskStatusOption.create({
    data: {
      organizationId,
      key,
      label: input.label,
      category: input.category,
      color: input.color,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
}

export async function updateTaskStatus(
  organizationId: string,
  id: string,
  input: z.infer<typeof updateStatusSchema>
) {
  const existing = await prisma.taskStatusOption.findFirst({ where: { id, organizationId } });
  if (!existing) throw AppError.notFound("Status not found");

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.taskStatusOption.updateMany({
        where: { organizationId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    if (input.isRecurringDefault) {
      await tx.taskStatusOption.updateMany({
        where: { organizationId, isRecurringDefault: true, id: { not: id } },
        data: { isRecurringDefault: false },
      });
    }
    return tx.taskStatusOption.update({ where: { id }, data: input });
  });
}

export async function deleteTaskStatus(organizationId: string, id: string) {
  const existing = await prisma.taskStatusOption.findFirst({ where: { id, organizationId } });
  if (!existing) throw AppError.notFound("Status not found");

  const total = await prisma.taskStatusOption.count({ where: { organizationId } });
  if (total <= 1) throw AppError.badRequest("An organization must have at least one task status");

  if (existing.isDefault) throw AppError.badRequest("Set a different default status before deleting this one");
  if (existing.isRecurringDefault) {
    throw AppError.badRequest("Set a different ongoing/recurring default status before deleting this one");
  }

  const inUse = await prisma.task.count({ where: { organizationId, status: existing.key } });
  if (inUse > 0) {
    throw AppError.badRequest(
      `${inUse} task(s) currently use this status. Move them to a different status before deleting it.`
    );
  }

  await prisma.taskStatusOption.delete({ where: { id } });
}

export async function reorderTaskStatuses(organizationId: string, input: z.infer<typeof reorderStatusesSchema>) {
  const ids = input.order.map((o) => o.id);
  const existingCount = await prisma.taskStatusOption.count({ where: { organizationId, id: { in: ids } } });
  if (existingCount !== ids.length) throw AppError.badRequest("One or more statuses were not found");

  await prisma.$transaction(
    input.order.map((o) => prisma.taskStatusOption.update({ where: { id: o.id }, data: { order: o.order } }))
  );
  return listStatusOptions(organizationId);
}

export async function getOrganization(organizationId: string) {
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
}

export async function updateOrganization(organizationId: string, input: z.infer<typeof updateOrganizationSchema>) {
  return prisma.organization.update({ where: { id: organizationId }, data: input });
}
