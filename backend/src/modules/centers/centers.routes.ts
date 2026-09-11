import { FastifyInstance } from "fastify";
import * as centersService from "./centers.service.js";
import { createCenterSchema, updateCenterSchema } from "./centers.schemas.js";
import { getOverview } from "../overview/overview.service.js";
import { parseRangeQuery } from "../overview/overview.schemas.js";

export default async function centersRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/centers", async (request) => {
    return centersService.listCenters(request.authUser.organizationId);
  });

  fastify.get("/centers/:id", async (request) => {
    const { id } = request.params as { id: string };
    return centersService.getCenter(request.authUser.organizationId, id);
  });

  fastify.get("/centers/:id/dashboard", async (request) => {
    const { id } = request.params as { id: string };
    const { startDate, endDate } = parseRangeQuery(request.query as Record<string, string>);
    const [headcount, overview] = await Promise.all([
      centersService.centerHeadcount(request.authUser.organizationId, id),
      getOverview(request.authUser.organizationId, { centerId: id }, startDate, endDate),
    ]);
    return { headcount, ...overview };
  });

  fastify.post(
    "/centers",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const input = createCenterSchema.parse(request.body);
      const center = await centersService.createCenter(request.authUser.organizationId, input);
      return reply.code(201).send(center);
    }
  );

  fastify.patch(
    "/centers/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = updateCenterSchema.parse(request.body);
      return centersService.updateCenter(request.authUser.organizationId, id, input);
    }
  );

  fastify.delete(
    "/centers/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await centersService.deleteCenter(request.authUser.organizationId, id);
      return reply.code(204).send();
    }
  );
}
