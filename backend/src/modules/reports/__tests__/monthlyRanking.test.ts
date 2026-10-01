import { describe, it, expect, vi } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({ prisma: {} }));
const { rankMonthlyTeam } = await import("../reports.service.js");

const person = (name: string, planned: number, rate: number) => ({ name, report: { tasksPlanned: planned, completionRate: rate } });

describe("rankMonthlyTeam", () => {
  const team = [
    person("high", 10, 0.9),
    person("mid", 10, 0.6),
    person("low", 10, 0.2),
    person("zero", 10, 0),
    person("idle1", 0, 0),
    person("idle2", 0, 0),
  ];
  const r = rankMonthlyTeam(team);

  it("never lists anyone as both top performer and at-risk", () => {
    const top = new Set(r.topPerformers.map((p) => p.name));
    expect(r.atRisk.filter((p) => top.has(p.name))).toEqual([]);
  });
  it("keeps people with nothing planned out of both lists", () => {
    const names = [...r.topPerformers, ...r.atRisk].map((p) => p.name);
    expect(names).not.toContain("idle1");
    expect(names).not.toContain("idle2");
  });
  it("ranks top best-first and at-risk worst-first", () => {
    expect(r.topPerformers.map((p) => p.name)).toEqual(["high", "mid"]);
    expect(r.atRisk.map((p) => p.name)).toEqual(["zero", "low"]);
  });
  it("averages only people who had something planned", () => {
    expect(r.avgCompletionRate).toBeCloseTo((0.9 + 0.6 + 0.2 + 0) / 4);
  });
  it("lists everyone, unmeasurable people last", () => {
    expect(r.all.map((p) => p.name)).toEqual(["high", "mid", "low", "zero", "idle1", "idle2"]);
  });
  it("has no average when nobody had anything planned", () => {
    expect(rankMonthlyTeam([person("a", 0, 0)]).avgCompletionRate).toBeNull();
  });
});
