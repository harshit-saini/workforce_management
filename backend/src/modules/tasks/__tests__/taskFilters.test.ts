import { describe, it, expect, vi } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: { taskStatusOption: { findMany: vi.fn().mockResolvedValue([{ key: "DONE" }]) } },
}));

const { buildTaskListWhere } = await import("../tasks.service.js");
const { listTasksQuerySchema } = await import("../tasks.schemas.js");

const parse = (q: Record<string, string>) => {
  const { page: _p, pageSize: _s, ...filters } = listTasksQuerySchema.parse(q);
  return filters;
};

describe("task list filters", () => {
  it("accepts one priority or several", () => {
    expect(parse({ priority: "HIGH" }).priority).toEqual(["HIGH"]);
    expect(parse({ priority: "HIGH, URGENT" }).priority).toEqual(["HIGH", "URGENT"]);
    expect(() => parse({ priority: "HIGH,BOGUS" })).toThrow();
  });

  it("filters by any of the given priorities", async () => {
    const where = await buildTaskListWhere("org1", null, parse({ priority: "HIGH,URGENT" }));
    expect(where).toMatchObject({ priority: { in: ["HIGH", "URGENT"] } });
  });

  it("reads collapseSubtasks=false as false (not true, as z.coerce.boolean would)", () => {
    expect(parse({ collapseSubtasks: "false" }).collapseSubtasks).toBe(false);
    expect(parse({ collapseSubtasks: "true" }).collapseSubtasks).toBe(true);
  });

  it("leaves the query alone unless subtasks are collapsed", async () => {
    const where = await buildTaskListWhere("org1", null, parse({}));
    expect(where).toHaveProperty("organizationId", "org1");
  });

  it("hides a subtask only when its parent is also in the results", async () => {
    const where: any = await buildTaskListWhere("org1", null, parse({ collapseSubtasks: "true", priority: "HIGH" }));
    const [base, rule] = where.AND;
    expect(base).toMatchObject({ organizationId: "org1", priority: { in: ["HIGH"] } });
    // top-level tasks always stay; a subtask stays only if its parent does NOT match the same filters
    expect(rule.OR).toEqual([{ parentTaskId: null }, { parentTask: { isNot: base } }]);
  });
});
