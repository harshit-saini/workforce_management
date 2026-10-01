import { z } from "zod";
import { StatusCategory, TaskPriority } from "@prisma/client";
import { MAX_IMPORT_ROWS } from "./taskSheet.js";

/** Up to 20 labels of at most 50 characters; blanks dropped and case-insensitive repeats merged (first spelling wins). */
export const tagsSchema = z
  .array(z.string())
  .transform((tags) => {
    const seen = new Set<string>();
    return tags
      .map((t) => t.trim())
      .filter((t) => {
        const key = t.toLowerCase();
        if (!t || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })
  .pipe(z.array(z.string().max(50)).max(20));

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  // Validated against the organization's configured statuses at the service layer.
  // Falls back to the org's default status when omitted.
  status: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default("MEDIUM"),
  isRecurring: z.boolean().default(false),
  assigneeId: z.string().optional(),
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
  parentTaskId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  estimatedHours: z.number().min(0).optional(),
  tags: tagsSchema.default([]),
  watcherIds: z.array(z.string()).default([]),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  isRecurring: z.boolean().optional(),
  assigneeId: z.string().optional().nullable(),
  centerId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  estimatedHours: z.number().min(0).optional().nullable(),
  blockedReason: z.string().optional().nullable(),
  tags: tagsSchema.optional(),
  watcherIds: z.array(z.string()).optional(),
});

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  status: z.string().optional(),
  // Comma-separated categories, e.g. "BLOCKED" or "BACKLOG,ACTIVE,BLOCKED" — lets links like the
  // dashboard's "Blocked" tile filter across every status the org maps to those categories.
  statusCategory: z
    .string()
    .transform((v) => v.split(",").map((c) => c.trim()).filter(Boolean))
    .pipe(z.array(z.nativeEnum(StatusCategory)).min(1))
    .optional(),
  view: z.enum(["backlog", "board", "ongoing", "all"]).default("all"),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeId: z.string().optional(),
  centerId: z.string().optional(),
  departmentId: z.string().optional(),
  tag: z.string().optional(),
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  search: z.string().optional(),
  parentTaskId: z.string().optional(),
  topLevelOnly: z.coerce.boolean().optional(),
});

export const exportTasksQuerySchema = listTasksQuerySchema.omit({ page: true, pageSize: true });

// Cells are free text here on purpose — each value is checked against the org's data by
// validateImportRow, which reports problems per cell instead of rejecting the whole request.
const importCell = z.string().max(10_000).default("");

export const importRowsBodySchema = z.object({
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().min(1),
        title: importCell,
        description: importCell,
        assigneeEmail: importCell,
        center: importCell,
        department: importCell,
        status: importCell,
        priority: importCell,
        dueDate: importCell,
        estimatedHours: importCell,
        tags: importCell,
      })
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

export const addCommentSchema = z.object({
  comment: z.string().min(1),
  statusChangedTo: z.string().optional(),
});

export const logTimeSchema = z.object({
  date: z.coerce.date(),
  hoursLogged: z.number().min(0.25).max(24).default(8),
  note: z.string().optional(),
});
