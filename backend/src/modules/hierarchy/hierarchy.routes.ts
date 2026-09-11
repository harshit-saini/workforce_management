import { FastifyInstance } from "fastify";
import * as hierarchyService from "./hierarchy.service.js";
import { reassignManagerSchema, importCsvSchema } from "./hierarchy.schemas.js";

export default async function hierarchyRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/hierarchy/tree", async (request) => {
    return hierarchyService.getTree(request.authUser.organizationId);
  });

  fastify.get("/users/:id/reports", async (request) => {
    const { id } = request.params as { id: string };
    return hierarchyService.getDirectReports(request.authUser.organizationId, id);
  });

  fastify.get("/users/:id/downline", async (request) => {
    const { id } = request.params as { id: string };
    return hierarchyService.getDownline(request.authUser.organizationId, id);
  });

  fastify.get("/users/:id/chain", async (request) => {
    const { id } = request.params as { id: string };
    return hierarchyService.getReportingChain(request.authUser.organizationId, id);
  });

  fastify.patch(
    "/users/:id/manager",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const { managerId } = reassignManagerSchema.parse(request.body);
      return hierarchyService.reassignManager(request.authUser.organizationId, request.authUser, id, managerId);
    }
  );

  fastify.post(
    "/hierarchy/import",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { csv } = importCsvSchema.parse(request.body);
      return hierarchyService.importHierarchyCsv(request.authUser.organizationId, request.authUser, csv);
    }
  );
}
