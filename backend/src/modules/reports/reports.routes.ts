import { FastifyInstance } from "fastify";
import * as reportsService from "./reports.service.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getReportingChainUp } from "../../lib/hierarchy.js";
import {
  weeklyQuerySchema,
  weeklyTeamSummaryQuerySchema,
  submitWeeklySchema,
  reviewWeeklySchema,
  saveSummarySchema,
  remindWeeklySchema,
  monthlyQuerySchema,
  monthlyTeamSummaryQuerySchema,
} from "./reports.schemas.js";

/**
 * Confirms targetUserId belongs to organizationId before applying any role-based shortcut —
 * without this, an ADMIN/OWNER/MANAGER's role check alone would let them pass a user id from
 * a different organization and read that user's report data.
 */
async function assertCanViewUserReport(fastify: FastifyInstance, actorId: string, actorRole: string, targetUserId: string, organizationId: string) {
  if (actorId === targetUserId) return;

  const target = await prisma.user.findFirst({ where: { id: targetUserId, organizationId }, select: { id: true } });
  if (!target) throw AppError.forbidden("You cannot view this user's report");

  if (actorRole === "ADMIN" || actorRole === "OWNER") return;
  if (actorRole === "MANAGER") {
    const chain = await getReportingChainUp(organizationId, targetUserId);
    if (chain.includes(actorId)) return;
  }
  throw AppError.forbidden("You cannot view this user's report");
}

/** "2026-09-21" means that calendar day locally, not UTC midnight (which can fall in the previous local day). */
function parseDateParam(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) throw AppError.badRequest("Invalid week");
  return date;
}

export default async function reportsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/reports/weekly", async (request) => {
    const query = weeklyQuerySchema.parse(request.query);
    const targetUserId = query.userId ?? request.authUser.id;
    await assertCanViewUserReport(fastify, request.authUser.id, request.authUser.role, targetUserId, request.authUser.organizationId);
    const orgId = request.authUser.organizationId;
    // No week asked for: your own report opens on the oldest week still waiting to be submitted.
    const week = query.week
      ? parseDateParam(query.week)
      : targetUserId === request.authUser.id
        ? await reportsService.getDefaultWeek(orgId, targetUserId)
        : new Date();
    return reportsService.getWeeklyReport(orgId, targetUserId, week);
  });

  fastify.get("/reports/weekly/team-summary", async (request) => {
    const query = weeklyTeamSummaryQuerySchema.parse(request.query);
    const week = query.week ? parseDateParam(query.week) : new Date();
    return reportsService.weeklyTeamSummary(request.authUser.organizationId, request.authUser, week, query.centerId);
  });

  fastify.post("/reports/weekly/:id/submit", async (request) => {
    const { id } = request.params as { id: string };
    const input = submitWeeklySchema.parse(request.body);
    return reportsService.submitWeeklyReport(request.authUser.organizationId, request.authUser, id, input);
  });

  fastify.put("/reports/weekly/:id/summary", async (request) => {
    const { id } = request.params as { id: string };
    const input = saveSummarySchema.parse(request.body);
    return reportsService.saveWeeklySummary(request.authUser.organizationId, request.authUser, id, input);
  });

  fastify.post("/reports/weekly/remind", async (request) => {
    const input = remindWeeklySchema.parse(request.body);
    const week = input.week ? parseDateParam(input.week) : new Date();
    return reportsService.remindWeeklyReports(request.authUser.organizationId, request.authUser, input, week);
  });

  fastify.post("/reports/weekly/:id/unreview", async (request) => {
    const { id } = request.params as { id: string };
    return reportsService.undoWeeklyReview(request.authUser.organizationId, request.authUser, id);
  });

  fastify.post("/reports/weekly/:id/review", async (request) => {
    const { id } = request.params as { id: string };
    const input = reviewWeeklySchema.parse(request.body);
    return reportsService.reviewWeeklyReport(request.authUser.organizationId, request.authUser, id, input);
  });

  fastify.get("/reports/monthly", async (request) => {
    const query = monthlyQuerySchema.parse(request.query);
    const targetUserId = query.userId ?? request.authUser.id;
    await assertCanViewUserReport(fastify, request.authUser.id, request.authUser.role, targetUserId, request.authUser.organizationId);
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    return reportsService.getMonthlyReport(request.authUser.organizationId, targetUserId, year, month);
  });

  fastify.get("/reports/monthly/team-summary", async (request) => {
    const query = monthlyTeamSummaryQuerySchema.parse(request.query);
    return reportsService.monthlyTeamSummary(
      request.authUser.organizationId,
      request.authUser,
      query.year,
      query.month,
      query.centerId,
      query.departmentId
    );
  });
}
