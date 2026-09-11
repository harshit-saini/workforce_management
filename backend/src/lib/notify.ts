import { prisma } from "./prisma.js";
import { NotificationType } from "@prisma/client";

interface NotifyParams {
  organizationId: string;
  userId: string;
  type: NotificationType;
  message: string;
  relatedTaskId?: string;
  relatedReportId?: string;
  dedupeKey: string;
  cooldownMs: number;
}

/**
 * Creates a notification honoring the user's per-type channel preferences and a
 * dedupe cooldown window so scheduled scans don't spam the same condition repeatedly.
 */
export async function notifyUser(params: NotifyParams): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId: params.userId, type: params.type } },
  });
  const inAppEnabled = pref?.inAppEnabled ?? true;
  const emailEnabled = pref?.emailEnabled ?? true;
  if (!inAppEnabled && !emailEnabled) return false;

  const cutoff = new Date(Date.now() - params.cooldownMs);
  const recent = await prisma.notification.findFirst({
    where: { dedupeKey: params.dedupeKey, createdAt: { gte: cutoff } },
  });
  if (recent) return false;

  await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      type: params.type,
      relatedTaskId: params.relatedTaskId,
      relatedReportId: params.relatedReportId,
      message: params.message,
      channel: inAppEnabled ? "IN_APP" : "EMAIL",
      dedupeKey: params.dedupeKey,
    },
  });

  if (emailEnabled) {
    console.log(`[email:notification] to=${params.userId} type=${params.type} message="${params.message}"`);
  }

  return true;
}
