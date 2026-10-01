import { describe, it, expect, vi, beforeEach } from "vitest";

// owner → mgr → (emp1, emp2); owner → other
const fixtureUsers = [
  { id: "owner", managerId: null },
  { id: "mgr", managerId: "owner" },
  { id: "emp1", managerId: "mgr" },
  { id: "emp2", managerId: "mgr" },
  { id: "other", managerId: "owner" },
];

const tx = {
  user: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  auditLog: { createMany: vi.fn(), create: vi.fn() },
};
const findFirst = vi.fn();

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    user: { findMany: vi.fn().mockResolvedValue(fixtureUsers), findFirst: (...args: unknown[]) => findFirst(...args) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { removeUser, updateRole, updateStatus } = await import("../users.service.js");

const admin = { id: "admin", role: "ADMIN", organizationId: "org1" } as any;

beforeEach(() => {
  vi.clearAllMocks();
  tx.user.findMany.mockResolvedValue([{ id: "emp1" }, { id: "emp2" }]);
});

describe("self-protection", () => {
  it("won't let an admin change their own role", async () => {
    await expect(updateRole("org1", admin, "admin", "EMPLOYEE")).rejects.toMatchObject({ statusCode: 403 });
  });
  it("won't let an admin change their own status", async () => {
    await expect(updateStatus("org1", admin, "admin", "INACTIVE")).rejects.toMatchObject({ statusCode: 403 });
  });
  it("won't let an admin remove themselves", async () => {
    await expect(removeUser("org1", admin, "admin")).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("removeUser reassigns direct reports", () => {
  it("moves them to the chosen manager and records it", async () => {
    findFirst.mockResolvedValueOnce({ id: "mgr", role: "MANAGER" }).mockResolvedValueOnce({ id: "other" });
    await removeUser("org1", admin, "mgr", "other");
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["emp1", "emp2"] } }, data: { managerId: "other" } });
    expect(tx.auditLog.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(tx.user.update).toHaveBeenCalled();
  });

  it("moves them to the top level when no one is chosen", async () => {
    findFirst.mockResolvedValueOnce({ id: "mgr", role: "MANAGER" });
    await removeUser("org1", admin, "mgr");
    expect(tx.user.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["emp1", "emp2"] } }, data: { managerId: null } });
  });

  it("refuses a new manager from the removed person's own reports", async () => {
    findFirst.mockResolvedValueOnce({ id: "mgr", role: "MANAGER" }).mockResolvedValueOnce({ id: "emp1" });
    await expect(removeUser("org1", admin, "mgr", "emp1")).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("refuses a new manager who isn't an active member of the org", async () => {
    findFirst.mockResolvedValueOnce({ id: "mgr", role: "MANAGER" }).mockResolvedValueOnce(null);
    await expect(removeUser("org1", admin, "mgr", "ghost")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("leaves the owner alone", async () => {
    findFirst.mockResolvedValueOnce({ id: "owner", role: "OWNER" });
    await expect(removeUser("org1", admin, "owner")).rejects.toMatchObject({ statusCode: 403 });
  });
});
