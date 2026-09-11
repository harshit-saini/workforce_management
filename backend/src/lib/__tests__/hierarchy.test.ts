import { describe, it, expect, vi } from "vitest";

const fixtureUsers = [
  { id: "A", managerId: null },
  { id: "B", managerId: "A" },
  { id: "C", managerId: "A" },
  { id: "D", managerId: "B" },
  { id: "E", managerId: "B" },
  { id: "F", managerId: "C" },
];

vi.mock("../prisma.js", () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue(fixtureUsers),
    },
  },
}));

const { getDownlineUserIds, getReportingChainUp, wouldCreateCycle } = await import("../hierarchy.js");

describe("getDownlineUserIds", () => {
  it("returns all direct and indirect reports, excluding the root", async () => {
    const downline = await getDownlineUserIds("org1", "A");
    expect(new Set(downline)).toEqual(new Set(["B", "C", "D", "E", "F"]));
  });

  it("returns an empty list for a leaf user", async () => {
    const downline = await getDownlineUserIds("org1", "D");
    expect(downline).toEqual([]);
  });
});

describe("getReportingChainUp", () => {
  it("walks the manager chain upward, excluding the starting user", async () => {
    const chain = await getReportingChainUp("org1", "D");
    expect(chain).toEqual(["B", "A"]);
  });

  it("returns an empty chain for the root user", async () => {
    const chain = await getReportingChainUp("org1", "A");
    expect(chain).toEqual([]);
  });
});

describe("wouldCreateCycle", () => {
  it("flags reassigning a user to themself", async () => {
    expect(await wouldCreateCycle("org1", "B", "B")).toBe(true);
  });

  it("flags reassigning an ancestor to report to their own descendant", async () => {
    // A is an ancestor of D; making A report to D would create a cycle (A -> D -> B -> A).
    expect(await wouldCreateCycle("org1", "A", "D")).toBe(true);
  });

  it("allows reassigning a descendant to report to an unrelated ancestor branch", async () => {
    // D reporting to C is fine: C is not a descendant of D.
    expect(await wouldCreateCycle("org1", "D", "C")).toBe(false);
  });

  it("allows a fresh reassignment with no relation at all", async () => {
    expect(await wouldCreateCycle("org1", "F", "E")).toBe(false);
  });
});
