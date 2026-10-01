import { describe, it, expect, vi } from "vitest";

const counts: Record<string, number> = {};
const countMock = vi.fn(async (args: any) => {
  const w = args.where;
  if (w.dueDate && w.OR) return counts.overdueThen ?? 0;
  if (w.OR) return counts.openThen ?? 0;
  if (w.dueDate) return counts.overdue ?? 0;
  if (w.completedAt) return counts.prevCompleted ?? 0;
  if (w.createdAt && w.status) return counts.createdDone ?? 0;
  if (w.createdAt) return counts.prevCreated ?? 0;
  throw new Error("Unexpected count " + JSON.stringify(w));
});

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    task: { count: countMock },
    taskLog: { aggregate: vi.fn().mockResolvedValue({ _sum: { hoursLogged: 6 } }) },
    taskStatusOption: { findMany: vi.fn().mockResolvedValue([{ key: "DONE" }]) },
  },
}));

const { getOverviewExtras } = await import("../overview.service.js");
const { parseRangeQuery } = await import("../overview.schemas.js");

describe("getOverviewExtras", () => {
  it("lists every day of the range, zeros included", async () => {
    const start = new Date("2026-09-25T00:00:00.000Z");
    const end = new Date("2026-10-01T23:59:59.999Z");
    const extras = await getOverviewExtras("org", {}, start, end, [
      { date: "2026-09-27", hours: 3 },
      { date: "2026-10-01", hours: 5 },
    ]);
    expect(extras.hoursPerDay.map((d) => d.date)).toEqual([
      "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
    ]);
    expect(extras.hoursPerDay.map((d) => d.hours)).toEqual([0, 0, 3, 0, 0, 0, 5]);
  });

  it("returns overdue, the finished share of new tasks, and last period's numbers", async () => {
    Object.assign(counts, { overdue: 5, createdDone: 3, prevCreated: 4, prevCompleted: 2, openThen: 40, overdueThen: 7 });
    const extras = await getOverviewExtras("org", {}, new Date("2026-09-25T00:00:00.000Z"), new Date("2026-10-01T23:59:59.999Z"), []);
    expect(extras).toMatchObject({
      tasksOverdue: 5,
      createdDone: 3,
      previous: { label: "last week", tasksCreated: 4, tasksCompleted: 2, hoursLogged: 6, tasksOpen: 40, tasksOverdue: 7 },
    });
  });

  it("labels a non-week comparison period by its length", async () => {
    const extras = await getOverviewExtras("org", {}, new Date("2026-09-29T00:00:00.000Z"), new Date("2026-10-01T23:59:59.999Z"), []);
    expect(extras.previous.label).toBe("the previous 3 days");
  });
});

describe("Last 7 days range", () => {
  it("covers today and the six days before it", () => {
    const { startDate, endDate } = parseRangeQuery({ preset: "last_7_days" });
    const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
    expect(days).toBe(7);
    expect(endDate.getTime()).toBeGreaterThanOrEqual(Date.now());
    expect(startDate.getHours()).toBe(0);
  });
});
