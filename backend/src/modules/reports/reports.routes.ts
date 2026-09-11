import { FastifyInstance } from "fastify";
import * as reportsService from "./reports.service.js";
import { AppError } from "../../lib/errors.js";
import { getReportingChainUp } from "../../lib/hierarchy.js";
import {
  weeklyQuerySchema,
  weeklyTeamSummaryQuerySchema,
  submitWeeklySchema,
  reviewWeeklySchema,
  monthlyQuerySchema,
  monthlyTeamSummaryQuerySchema,
} from "./reports.schemas.js";

async function assertCanViewUserReport(fastify: FastifyInstance, actorId: string, actorRole: string, targetUserId: string, organizationId: string) {
  if (actorId === targetUserId || actorRole === "ADMIN" || actorRole === "OWNER") return;
  if (actorRole === "MANAGER") {
    const chain = await getReportingChainUp(organizationId, targetUserId);
    if (chain.includes(actorId)) return;
  }
  throw AppError.forbidden("You cannot view this user's report");
}

export default async function reportsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/reports/weekly", async (request) => {
    const query = weeklyQuerySchema.parse(request.query);
    const targetUserId = query.userId ?? request.authUser.id;
    await assertCanViewUserReport(fastify, request.authUser.id, request.authUser.role, targetUserId, request.authUser.organizationId);
    const week = query.week ? new Date(query.week) : new Date();
    return reportsService.getWeeklyReport(request.authUser.organizationId, targetUserId, week);
  });

  fastify.get("/reports/weekly/team-summary", async (request) => {
    const query = weeklyTeamSummaryQuerySchema.parse(request.query);
    const week = query.week ? new Date(query.week) : new Date();
    return reportsService.weeklyTeamSummary(request.authUser.organizationId, request.authUser, week, query.centerId);
  });

  fastify.post("/reports/weekly/:id/submit", async (request) => {
    const { id } = request.params as { id: string };
    const input = submitWeeklySchema.parse(request.body);
    return reportsService.submitWeeklyReport(request.authUser.organizationId, request.authUser, id, input);
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
