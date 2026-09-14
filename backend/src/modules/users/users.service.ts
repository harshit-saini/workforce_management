import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { generateOpaqueToken } from "../../lib/tokens.js";
import { sendEmail } from "../../lib/email.js";
import { config } from "../../lib/config.js";
import { AuthUser } from "../../plugins/auth.js";
import { paginationMeta, toSkipTake } from "../../lib/pagination.js";
import { z } from "zod";
import {
  listUsersQuerySchema,
  inviteUserSchema,
  selfUpdateSchema,
  adminUpdateUserSchema,
} from "./users.schemas.js";
import { Prisma, Role } from "@prisma/client";

const userSelect = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  avatarUrl: true,
  title: true,
  role: true,
  status: true,
  isCenterHead: true,
  centerId: true,
  departmentId: true,
  managerId: true,
  startDate: true,
  createdAt: true,
  center: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, email: true } },
} satisfies Prisma.UserSelect;

export async function listUsers(organizationId: string, query: z.infer<typeof listUsersQuerySchema>) {
  const where: Prisma.UserWhereInput = {
    organizationId,
    deletedAt: null,
    ...(query.centerId ? { centerId: query.centerId } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userSelect,
      orderBy: { name: "asc" },
      ...toSkipTake(query.page, query.pageSize),
    }),
    prisma.user.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, query.page, query.pageSize) };
}

export async function getUser(organizationId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId }, select: userSelect });
  if (!user) throw AppError.notFound("User not found");
  return user;
}

export async function inviteUser(
  organizationId: string,
  input: z.infer<typeof inviteUserSchema>
) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) throw AppError.conflict("A user with this email already exists");

  const existingInvite = await prisma.invite.findFirst({
    where: { organizationId, email: input.email, acceptedAt: null, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) throw AppError.conflict("An active invite already exists for this email");

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await prisma.invite.create({
    data: {
      organizationId,
      email: input.email,
      role: input.role,
      centerId: input.centerId,
      departmentId: input.departmentId,
      managerId: input.managerId,
      title: input.title,
      token,
      expiresAt,
    },
  });

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  const inviteUrl = `${config.frontendUrl}/invite/${invite.token}`;
  await sendEmail({
    to: invite.email,
    subject: `You're invited to join ${organization?.name ?? "your team"} on Workforce Management`,
    html: `
      <p>You've been invited to join <strong>${organization?.name ?? "your team"}</strong> as ${input.role.toLowerCase()}.</p>
      <p><a href="${inviteUrl}">Accept your invite</a></p>
      <p>This link expires on ${invite.expiresAt.toDateString()}.</p>
    `,
  });

  return invite;
}

export async function listInvites(organizationId: string) {
  return prisma.invite.findMany({
    where: { organizationId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateSelf(userId: string, input: z.infer<typeof selfUpdateSchema>) {
  return prisma.user.update({ where: { id: userId }, data: input, select: userSelect });
}

export async function adminUpdateUser(
  organizationId: string,
  actor: AuthUser,
  targetUserId: string,
  input: z.infer<typeof adminUpdateUserSchema>
) {
  const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
  if (!target) throw AppError.notFound("User not found");

  if (input.managerId !== undefined && input.managerId !== target.managerId) {
    const { wouldCreateCycle } = await import("../../lib/hierarchy.js");
    if (input.managerId) {
      if (await wouldCreateCycle(organizationId, targetUserId, input.managerId)) {
        throw AppError.badRequest("This manager reassignment would create a reporting cycle");
      }
    }
    await prisma.auditLog.create({
      data: {
        organizationId,
        action: "MANAGER_REASSIGNED",
        actorId: actor.id,
        targetUserId,
        metadata: { from: target.managerId, to: input.managerId },
      },
    });
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: input,
    select: userSelect,
  });

  return updated;
}

export async function updateRole(organizationId: string, actor: AuthUser, targetUserId: string, role: Role) {
  const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
  if (!target) throw AppError.notFound("User not found");
  if (target.role === "OWNER") throw AppError.forbidden("The organization owner's role cannot be changed");
  if (role === "OWNER") throw AppError.forbidden("Ownership cannot be transferred via role update");

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: targetUserId }, data: { role }, select: userSelect });
    await tx.auditLog.create({
      data: {
        organizationId,
        action: "ROLE_CHANGED",
        actorId: actor.id,
        targetUserId,
        metadata: { from: target.role, to: role },
      },
    });
    return user;
  });

  return updated;
}

export async function updateStatus(
  organizationId: string,
  actor: AuthUser,
  targetUserId: string,
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE"
) {
  const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
  if (!target) throw AppError.notFound("User not found");
  if (target.role === "OWNER") throw AppError.forbidden("The organization owner cannot be deactivated");

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: targetUserId }, data: { status }, select: userSelect });
    await tx.auditLog.create({
      data: {
        organizationId,
        action: status === "ACTIVE" ? "USER_REACTIVATED" : "USER_DEACTIVATED",
        actorId: actor.id,
        targetUserId,
        metadata: { status },
      },
    });
    return user;
  });

  return updated;
}

export async function removeUser(organizationId: string, actor: AuthUser, targetUserId: string) {
  const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId } });
  if (!target) throw AppError.notFound("User not found");
  if (target.role === "OWNER") throw AppError.forbidden("The organization owner cannot be removed");

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUserId },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        action: "USER_REMOVED",
        actorId: actor.id,
        targetUserId,
      },
    });
  });
}
