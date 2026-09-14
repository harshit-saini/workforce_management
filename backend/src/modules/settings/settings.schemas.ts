import { z } from "zod";

const statusCategory = z.enum(["BACKLOG", "ACTIVE", "DONE", "BLOCKED"]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #3b82f6");

export const createStatusSchema = z.object({
  label: z.string().min(1).max(40),
  category: statusCategory,
  color: hexColor.default("#6b7280"),
});

export const updateStatusSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  category: statusCategory.optional(),
  color: hexColor.optional(),
  isDefault: z.boolean().optional(),
  isRecurringDefault: z.boolean().optional(),
});

export const reorderStatusesSchema = z.object({
  order: z.array(z.object({ id: z.string(), order: z.number().int().min(0) })).min(1),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(120),
});
