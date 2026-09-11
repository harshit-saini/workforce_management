import { FastifyInstance } from "fastify";
import * as departmentsService from "./departments.service.js";
import { createDepartmentSchema, updateDepartmentSchema } from "./departments.schemas.js";

export default async function departmentsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/departments", async (request) => {
    return departmentsService.listDepartments(request.authUser.organizationId);
  });

  fastify.post(
    "/departments",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const input = createDepartmentSchema.parse(request.body);
      const dept = await departmentsService.createDepartment(request.authUser.organizationId, input);
      return reply.code(201).send(dept);
    }
  );

  fastify.patch(
    "/departments/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = updateDepartmentSchema.parse(request.body);
      return departmentsService.updateDepartment(request.authUser.organizationId, id, input);
    }
  );

  fastify.delete(
    "/departments/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await departmentsService.deleteDepartment(request.authUser.organizationId, id);
      return reply.code(204).send();
    }
  );
}
