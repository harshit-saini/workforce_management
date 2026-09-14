-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('BACKLOG', 'ACTIVE', 'DONE', 'BLOCKED');

-- AlterTable: convert Task.status from the fixed TaskStatus enum to a free-form
-- string (org-defined statuses), preserving existing values via a cast.
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'BACKLOG';

-- AlterTable
ALTER TABLE "TaskComment" ALTER COLUMN "statusChangedTo" TYPE TEXT USING "statusChangedTo"::text;

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateTable
CREATE TABLE "TaskStatusOption" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "StatusCategory" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b7280',
    "order" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskStatusOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStatusOption_organizationId_order_idx" ON "TaskStatusOption"("organizationId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TaskStatusOption_organizationId_key_key" ON "TaskStatusOption"("organizationId", "key");

-- Note: Task_organizationId_status_idx already exists from the initial migration
-- and doesn't need to be recreated for a column type change.

-- AddForeignKey
ALTER TABLE "TaskStatusOption" ADD CONSTRAINT "TaskStatusOption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: give every existing organization the same default status set the
-- app used to hardcode, so existing tasks' status values (e.g. 'DONE', 'BACKLOG')
-- keep resolving correctly instead of becoming orphaned strings.
INSERT INTO "TaskStatusOption" ("id", "organizationId", "key", "label", "category", "color", "order", "isDefault", "isRecurringDefault", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  o.id,
  s.key,
  s.label,
  s.category::"StatusCategory",
  s.color,
  s.ord,
  s.is_default,
  s.is_recurring_default,
  now(),
  now()
FROM "Organization" o
CROSS JOIN (VALUES
  ('BACKLOG', 'Backlog', 'BACKLOG', '#9ca3af', 0, true, false),
  ('TODO', 'To do', 'ACTIVE', '#3b82f6', 1, false, false),
  ('IN_PROGRESS', 'In progress', 'ACTIVE', '#6366f1', 2, false, false),
  ('IN_REVIEW', 'In review', 'ACTIVE', '#a855f7', 3, false, false),
  ('BLOCKED', 'Blocked', 'BLOCKED', '#ef4444', 4, false, false),
  ('DONE', 'Done', 'DONE', '#22c55e', 5, false, false),
  ('ONGOING', 'Ongoing', 'ACTIVE', '#14b8a6', 6, false, true)
) AS s(key, label, category, color, ord, is_default, is_recurring_default)
ON CONFLICT ("organizationId", "key") DO NOTHING;
