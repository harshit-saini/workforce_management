import { z } from "zod";

export const createDepartmentSchema = z.object({
  name: z.string().min(1).max(120),
  headUserId: z.string().optional(),
});

export const updateDepartmentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  headUserId: z.string().optional().nullable(),
});
