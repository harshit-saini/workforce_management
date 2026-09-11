import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { z } from "zod";
import { createCenterSchema, updateCenterSchema } from "./centers.schemas.js";

export async function listCenters(organizationId: string) {
  return prisma.center.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getCenter(organizationId: string, id: string) {
  const center = await prisma.center.findFirst({ where: { id, organizationId } });
  if (!center) throw AppError.notFound("Center not found");
  return center;
}

export async function createCenter(organizationId: string, input: z.infer<typeof createCenterSchema>) {
  const existing = await prisma.center.findFirst({ where: { organizationId, code: input.code } });
  if (existing) throw AppError.conflict(`A center with code "${input.code}" already exists`);
  return prisma.center.create({ data: { ...input, organizationId } });
}

export async function updateCenter(
  organizationId: string,
  id: string,
  input: z.infer<typeof updateCenterSchema>
) {
  await getCenter(organizationId, id);
  return prisma.center.update({ where: { id }, data: input });
}

export async function deleteCenter(organizationId: string, id: string) {
  await getCenter(organizationId, id);
  const memberCount = await prisma.user.count({ where: { centerId: id, deletedAt: null } });
  if (memberCount > 0) {
    throw AppError.badRequest("Cannot delete a center that still has assigned users; deactivate it instead");
  }
  await prisma.center.delete({ where: { id } });
}

export async function centerHeadcount(organizationId: string, id: string) {
  return prisma.user.count({ where: { organizationId, centerId: id, deletedAt: null, status: "ACTIVE" } });
}
