import { z } from "zod";

export const weeklyQuerySchema = z.object({
  userId: z.string().optional(),
  week: z.string().optional(), // any ISO date within the target week
});

export const weeklyTeamSummaryQuerySchema = z.object({
  week: z.string().optional(),
  centerId: z.string().optional(),
});

export const submitWeeklySchema = z.object({
  summary: z.string().optional(),
});

export const reviewWeeklySchema = z.object({
  status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  managerComment: z.string().optional(),
});

export const monthlyQuerySchema = z.object({
  userId: z.string().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const monthlyTeamSummaryQuerySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
});
