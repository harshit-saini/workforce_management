import { z } from "zod";

export const reassignManagerSchema = z.object({
  managerId: z.string().nullable(),
});

export const importCsvSchema = z.object({
  csv: z.string().min(1),
});

export const treeQuerySchema = z.object({
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
});
