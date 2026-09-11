import { FastifyInstance } from "fastify";
import { overviewQuerySchema, parseRangeQuery } from "./overview.schemas.js";
import { getOverview } from "./overview.service.js";
import { resolveAccessibleUserIds, intersectScope } from "../../lib/scope.js";

export default async function overviewRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/overview", async (request) => {
    const query = overviewQuerySchema.parse(request.query);
    const { startDate, endDate } = parseRangeQuery(request.query as Record<string, string>);

    const accessible = await resolveAccessibleUserIds(request.authUser);
    const userIds = intersectScope(accessible, query.userId ? [query.userId] : undefined);

    return getOverview(
      request.authUser.organizationId,
      { userIds, centerId: query.centerId, departmentId: query.departmentId },
      startDate,
      endDate
    );
  });
}
