import { FastifyInstance } from "fastify";
import * as settingsService from "./settings.service.js";
import {
  createStatusSchema,
  updateStatusSchema,
  reorderStatusesSchema,
  updateOrganizationSchema,
} from "./settings.schemas.js";

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/settings/task-statuses", async (request) => {
    return settingsService.listTaskStatuses(request.authUser.organizationId);
  });

  fastify.post(
    "/settings/task-statuses",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const input = createStatusSchema.parse(request.body);
      const status = await settingsService.createTaskStatus(request.authUser.organizationId, input);
      return reply.code(201).send(status);
    }
  );

  fastify.patch(
    "/settings/task-statuses/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = updateStatusSchema.parse(request.body);
      return settingsService.updateTaskStatus(request.authUser.organizationId, id, input);
    }
  );

  fastify.delete(
    "/settings/task-statuses/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await settingsService.deleteTaskStatus(request.authUser.organizationId, id);
      return reply.code(204).send();
    }
  );

  fastify.post(
    "/settings/task-statuses/reorder",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const input = reorderStatusesSchema.parse(request.body);
      return settingsService.reorderTaskStatuses(request.authUser.organizationId, input);
    }
  );

  fastify.get("/settings/organization", async (request) => {
    return settingsService.getOrganization(request.authUser.organizationId);
  });

  fastify.patch(
    "/settings/organization",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const input = updateOrganizationSchema.parse(request.body);
      return settingsService.updateOrganization(request.authUser.organizationId, input);
    }
  );
}
