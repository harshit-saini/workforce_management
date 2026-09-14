import { z } from "zod";
import { TaskPriority } from "@prisma/client";

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
  tags: z.array(z.string()).default([]),
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
  tags: z.array(z.string()).optional(),
  watcherIds: z.array(z.string()).optional(),
});

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  status: z.string().optional(),
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

export const addCommentSchema = z.object({
  comment: z.string().min(1),
  statusChangedTo: z.string().optional(),
});

export const logTimeSchema = z.object({
  date: z.coerce.date(),
  hoursLogged: z.number().min(0.25).max(24).default(8),
  note: z.string().optional(),
});
