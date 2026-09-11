import { z } from "zod";

export const createCenterSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(20),
  address: z.string().optional(),
  timezone: z.string().default("UTC"),
});

export const updateCenterSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  code: z.string().min(1).max(20).optional(),
  address: z.string().optional().nullable(),
  timezone: z.string().optional(),
  isActive: z.boolean().optional(),
});
