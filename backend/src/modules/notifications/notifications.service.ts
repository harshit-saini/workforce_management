import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { paginationMeta, toSkipTake } from "../../lib/pagination.js";
import { AuthUser } from "../../plugins/auth.js";
import { z } from "zod";
import { listNotificationsQuerySchema, updatePreferenceSchema, nudgeSchema } from "./notifications.schemas.js";
import { NotificationType } from "@prisma/client";
import { getDownlineUserIds } from "../../lib/hierarchy.js";

export async function listNotifications(userId: string, query: z.infer<typeof listNotificationsQuerySchema>) {
  const where = { userId, ...(query.unreadOnly ? { isRead: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(query.page, query.pageSize),
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { items, unreadCount, meta: paginationMeta(total, query.page, query.pageSize) };
}

export async function markRead(userId: string, id: string) {
  const notification = await prisma.notification.findFirst({ where: { id, userId } });
  if (!notification) throw AppError.notFound("Notification not found");
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}

export async function listPreferences(userId: string) {
  const existing = await prisma.notificationPreference.findMany({ where: { userId } });
  const byType = new Map(existing.map((p) => [p.type, p]));
  return Object.values(NotificationType).map((type) => {
    const pref = byType.get(type);
    return {
      type,
      inAppEnabled: pref?.inAppEnabled ?? true,
      emailEnabled: pref?.emailEnabled ?? true,
    };
  });
}

export async function updatePreference(userId: string, input: z.infer<typeof updatePreferenceSchema>) {
  return prisma.notificationPreference.upsert({
    where: { userId_type: { userId, type: input.type } },
    update: {
      ...(input.inAppEnabled !== undefined ? { inAppEnabled: input.inAppEnabled } : {}),
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
    },
    create: {
      userId,
      type: input.type,
      inAppEnabled: input.inAppEnabled ?? true,
      emailEnabled: input.emailEnabled ?? true,
    },
  });
}

export async function sendNudge(organizationId: string, actor: AuthUser, input: z.infer<typeof nudgeSchema>) {
  if (actor.role === "MANAGER") {
    const downline = await getDownlineUserIds(organizationId, actor.id);
    if (!downline.includes(input.userId)) {
      throw AppError.forbidden("You can only nudge members of your reporting chain");
    }
  } else if (actor.role !== "ADMIN" && actor.role !== "OWNER") {
    throw AppError.forbidden("You do not have permission to send nudges");
  }

  return prisma.notification.create({
    data: {
      organizationId,
      userId: input.userId,
      type: "MANUAL_NUDGE",
      message: input.message ?? "Your manager sent you a reminder to update your backlog.",
      channel: "IN_APP",
    },
  });
}
