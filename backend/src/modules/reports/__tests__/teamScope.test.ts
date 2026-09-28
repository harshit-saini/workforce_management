import { describe, it, expect, vi } from "vitest";

const fixtureUsers = [
  { id: "owner", managerId: null },
  { id: "mgr", managerId: "owner" },
  { id: "emp1", managerId: "mgr" },
  { id: "emp2", managerId: "mgr" },
  { id: "other", managerId: "owner" },
];

vi.mock("../../../lib/prisma.js", () => ({
  prisma: { user: { findMany: vi.fn().mockResolvedValue(fixtureUsers) } },
}));

const { resolveTeamUserIds } = await import("../reports.service.js");

const actor = (id: string, role: string) =>
  ({ id, role, organizationId: "org1", centerId: null, isCenterHead: false }) as any;

describe("resolveTeamUserIds", () => {
  it("gives owners and admins the whole org", async () => {
    expect(await resolveTeamUserIds("org1", actor("owner", "OWNER"))).toBeNull();
    expect(await resolveTeamUserIds("org1", actor("admin", "ADMIN"))).toBeNull();
  });

  it("limits managers to their downline", async () => {
    const ids = await resolveTeamUserIds("org1", actor("mgr", "MANAGER"));
    expect(new Set(ids)).toEqual(new Set(["emp1", "emp2"]));
  });

  it("forbids employees from seeing team rollups", async () => {
    await expect(resolveTeamUserIds("org1", actor("emp1", "EMPLOYEE"))).rejects.toMatchObject({ statusCode: 403 });
  });
});
