import { describe, it, expect, vi } from "vitest";

const completedTasks = [
  { id: "t1", completedAt: new Date("2024-01-02T10:00:00Z") },
  { id: "t2", completedAt: new Date("2024-01-02T12:00:00Z") },
  { id: "t3", completedAt: new Date("2024-01-03T09:00:00Z") },
];

const logs = [
  { hoursLogged: 3, date: new Date("2024-01-01T00:00:00Z") },
  { hoursLogged: 5, date: new Date("2024-01-01T00:00:00Z") },
  { hoursLogged: 2, date: new Date("2024-01-02T00:00:00Z") },
];

const comments = [
  {
    id: "c1",
    taskId: "t1",
    comment: "Finished it up",
    statusChangedTo: "DONE",
    createdAt: new Date("2024-01-02T10:05:00Z"),
    user: { id: "u1", name: "Alice" },
    task: { title: "Task One" },
  },
];

const activities = [
  {
    id: "a1",
    taskId: "t1",
    type: "REASSIGNED",
    message: "Reassigned from Bob to Alice",
    createdAt: new Date("2024-01-02T09:00:00Z"),
    user: { id: "u2", name: "Bob" },
    task: { title: "Task One" },
  },
];

const taskCountMock = vi.fn(async (args: any) => {
  const where = args.where;
  if (where.createdAt) return 12; // tasksCreated
  if (where.parentTaskId && where.status === "DONE") return 1; // subtaskDone
  if (where.status === "BLOCKED") return 2; // tasksBlocked
  if (where.status?.not === "DONE") return 4; // tasksOpen
  throw new Error("Unexpected task.count call: " + JSON.stringify(where));
});

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    task: {
      count: taskCountMock,
      findMany: vi.fn().mockResolvedValue(completedTasks),
      aggregate: vi.fn().mockResolvedValue({ _count: { _all: 5 } }),
    },
    taskLog: {
      findMany: vi.fn().mockResolvedValue(logs),
    },
    taskComment: {
      findMany: vi.fn().mockResolvedValue(comments),
    },
    taskActivity: {
      findMany: vi.fn().mockResolvedValue(activities),
    },
  },
}));

const { getOverview } = await import("../overview.service.js");

describe("getOverview aggregation", () => {
  it("aggregates task counts, hours by day, subtask completion, and a merged activity timeline", async () => {
    const result = await getOverview(
      "org1",
      { userIds: ["u1"] },
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-01-07T23:59:59Z")
    );

    expect(result.tasksCreated).toBe(12);
    expect(result.tasksOpen).toBe(4);
    expect(result.tasksBlocked).toBe(2);
    expect(result.tasksCompleted).toBe(3);

    // Hours grouped correctly per distinct day, summed within the day.
    expect(result.hoursLoggedTotal).toBe(10);
    expect(result.hoursByDay).toEqual([
      { date: "2024-01-01", hours: 8 },
      { date: "2024-01-02", hours: 2 },
    ]);

    expect(result.subtaskCompletion).toEqual({ total: 5, done: 1 });

    // completedByDay groups DONE tasks by their completedAt date.
    expect(result.completedByDay).toEqual([
      { date: "2024-01-02", count: 2 },
      { date: "2024-01-03", count: 1 },
    ]);

    // Comments + activities are merged and sorted newest-first.
    expect(result.activityTimeline.map((a) => a.id)).toEqual(["c1", "a1"]);
    expect(result.activityTimeline[0].message).toBe("Moved to DONE — Finished it up");
  });
});
