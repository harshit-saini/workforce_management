import { FastifyInstance } from "fastify";
import { overviewQuerySchema, parseRangeQuery } from "./overview.schemas.js";
import { getOverview, getOverviewExtras } from "./overview.service.js";
import { resolveAccessibleUserIds, intersectScope } from "../../lib/scope.js";

export default async function overviewRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/overview", async (request) => {
    const query = overviewQuerySchema.parse(request.query);
    const { startDate, endDate } = parseRangeQuery(request.query as Record<string, string>);

    const accessible = await resolveAccessibleUserIds(request.authUser);
    const userIds = intersectScope(accessible, query.userId ? [query.userId] : undefined);

    const scope = { userIds, centerId: query.centerId, departmentId: query.departmentId };
    const overview = await getOverview(request.authUser.organizationId, scope, startDate, endDate);
    const extras = await getOverviewExtras(request.authUser.organizationId, scope, startDate, endDate, overview.hoursByDay);
    return { ...overview, ...extras };
  });
}
