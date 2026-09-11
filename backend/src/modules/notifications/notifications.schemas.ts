import { z } from "zod";
import { NotificationType } from "@prisma/client";

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

export const updatePreferenceSchema = z.object({
  type: z.nativeEnum(NotificationType),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

export const nudgeSchema = z.object({
  userId: z.string(),
  message: z.string().min(1).max(500).optional(),
});
