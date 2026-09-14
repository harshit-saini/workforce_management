import { prisma } from "./prisma.js";
import { AppError } from "./errors.js";
import { StatusCategory } from "@prisma/client";

export async function listStatusOptions(organizationId: string) {
  return prisma.taskStatusOption.findMany({
    where: { organizationId },
    orderBy: { order: "asc" },
  });
}

/** Resolves which status keys belong to any of the given categories, for use in Prisma `status: { in: [...] }` filters. */
export async function getStatusKeysByCategory(organizationId: string, categories: StatusCategory[]): Promise<string[]> {
  const options = await prisma.taskStatusOption.findMany({
    where: { organizationId, category: { in: categories } },
    select: { key: true },
  });
  return options.map((o) => o.key);
}

export async function getStatusCategory(organizationId: string, key: string): Promise<StatusCategory | null> {
  const option = await prisma.taskStatusOption.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  return option?.category ?? null;
}

export async function getDefaultStatusKey(organizationId: string): Promise<string> {
  const option = await prisma.taskStatusOption.findFirst({ where: { organizationId, isDefault: true } });
  if (!option) throw AppError.badRequest("Organization has no default task status configured");
  return option.key;
}

export async function getRecurringDefaultStatusKey(organizationId: string): Promise<string> {
  const option = await prisma.taskStatusOption.findFirst({ where: { organizationId, isRecurringDefault: true } });
  if (!option) throw AppError.badRequest("Organization has no default ongoing/recurring status configured");
  return option.key;
}

export async function assertValidStatusKey(organizationId: string, key: string): Promise<void> {
  const exists = await prisma.taskStatusOption.findUnique({
    where: { organizationId_key: { organizationId, key } },
  });
  if (!exists) throw AppError.badRequest(`"${key}" is not a valid status for this organization`);
}
