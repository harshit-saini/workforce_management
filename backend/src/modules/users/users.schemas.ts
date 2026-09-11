import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  search: z.string().optional(),
});

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(Role).default("EMPLOYEE"),
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  title: z.string().optional(),
});

export const selfUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().optional().nullable(),
  title: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  centerId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  isCenterHead: z.boolean().optional(),
});

export const updateRoleSchema = z.object({
  role: z.nativeEnum(Role),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(UserStatus),
});
