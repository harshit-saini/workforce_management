import type { Prisma, PrismaClient, StatusCategory } from "@prisma/client";

export interface DefaultStatusSeed {
  key: string;
  label: string;
  category: StatusCategory;
  color: string;
  order: number;
  isDefault?: boolean;
  isRecurringDefault?: boolean;
}

// Mirrors the app's original fixed status set, now expressed as per-org seed data
// so admins can add/rename/reorder/recolor from here (see the Settings page).
export const DEFAULT_TASK_STATUSES: DefaultStatusSeed[] = [
  { key: "BACKLOG", label: "Backlog", category: "BACKLOG", color: "#9ca3af", order: 0, isDefault: true },
  { key: "TODO", label: "To do", category: "ACTIVE", color: "#3b82f6", order: 1 },
  { key: "IN_PROGRESS", label: "In progress", category: "ACTIVE", color: "#6366f1", order: 2 },
  { key: "IN_REVIEW", label: "In review", category: "ACTIVE", color: "#a855f7", order: 3 },
  { key: "BLOCKED", label: "Blocked", category: "BLOCKED", color: "#ef4444", order: 4 },
  { key: "DONE", label: "Done", category: "DONE", color: "#22c55e", order: 5 },
  { key: "ONGOING", label: "Ongoing", category: "ACTIVE", color: "#14b8a6", order: 6, isRecurringDefault: true },
];

type PrismaLike = PrismaClient | Prisma.TransactionClient;

export async function seedDefaultTaskStatuses(client: PrismaLike, organizationId: string) {
  await client.taskStatusOption.createMany({
    data: DEFAULT_TASK_STATUSES.map((s) => ({ organizationId, ...s })),
  });
}
