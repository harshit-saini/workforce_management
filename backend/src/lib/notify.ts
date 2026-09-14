import { prisma } from "./prisma.js";
import { NotificationType } from "@prisma/client";
import { sendEmail } from "./email.js";

const NOTIFICATION_SUBJECT: Record<NotificationType, string> = {
  TASK_DUE_SOON: "Task due soon",
  TASK_OVERDUE: "Task overdue",
  NO_TIME_LOGGED: "No time logged on your task",
  WEEKLY_REPORT_DUE: "Your weekly report is due",
  MONTHLY_REPORT_PENDING: "Monthly report review pending",
  TASK_ASSIGNED: "You were assigned a task",
  COMMENT_MENTION: "New activity on a task you're watching",
  MANUAL_NUDGE: "A reminder from your manager",
};

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
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { email: true, name: true } });
    if (user) {
      await sendEmail({
        to: user.email,
        subject: NOTIFICATION_SUBJECT[params.type],
        html: `<p>Hi ${user.name},</p><p>${params.message}</p>`,
      });
    }
  }

  return true;
}
