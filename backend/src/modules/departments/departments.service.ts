import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { z } from "zod";
import { createDepartmentSchema, updateDepartmentSchema } from "./departments.schemas.js";

export async function listDepartments(organizationId: string) {
  return prisma.department.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: { head: { select: { id: true, name: true } }, _count: { select: { members: true } } },
  });
}

export async function createDepartment(organizationId: string, input: z.infer<typeof createDepartmentSchema>) {
  const existing = await prisma.department.findFirst({ where: { organizationId, name: input.name } });
  if (existing) throw AppError.conflict(`A department named "${input.name}" already exists`);
  return prisma.department.create({ data: { ...input, organizationId } });
}

export async function updateDepartment(
  organizationId: string,
  id: string,
  input: z.infer<typeof updateDepartmentSchema>
) {
  const existing = await prisma.department.findFirst({ where: { id, organizationId } });
  if (!existing) throw AppError.notFound("Department not found");
  return prisma.department.update({ where: { id }, data: input });
}

export async function deleteDepartment(organizationId: string, id: string) {
  const existing = await prisma.department.findFirst({ where: { id, organizationId } });
  if (!existing) throw AppError.notFound("Department not found");
  const memberCount = await prisma.user.count({ where: { departmentId: id } });
  if (memberCount > 0) throw AppError.badRequest("Cannot delete a department with assigned members");
  await prisma.department.delete({ where: { id } });
}
