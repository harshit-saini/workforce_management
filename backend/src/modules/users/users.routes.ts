import { FastifyInstance } from "fastify";
import * as usersService from "./users.service.js";
import {
  listUsersQuerySchema,
  inviteUserSchema,
  selfUpdateSchema,
  adminUpdateUserSchema,
  updateRoleSchema,
  updateStatusSchema,
} from "./users.schemas.js";

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/users", async (request) => {
    const query = listUsersQuerySchema.parse(request.query);
    return usersService.listUsers(request.authUser.organizationId, query);
  });

  fastify.get("/users/:id", async (request) => {
    const { id } = request.params as { id: string };
    return usersService.getUser(request.authUser.organizationId, id);
  });

  fastify.post(
    "/users/invite",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const input = inviteUserSchema.parse(request.body);
      const invite = await usersService.inviteUser(request.authUser.organizationId, input);
      return reply.code(201).send(invite);
    }
  );

  fastify.get(
    "/users/invites",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      return usersService.listInvites(request.authUser.organizationId);
    }
  );

  fastify.patch("/users/me", async (request) => {
    const input = selfUpdateSchema.parse(request.body);
    return usersService.updateSelf(request.authUser.id, input);
  });

  fastify.patch(
    "/users/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = adminUpdateUserSchema.parse(request.body);
      return usersService.adminUpdateUser(request.authUser.organizationId, request.authUser, id, input);
    }
  );

  fastify.patch(
    "/users/:id/role",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const { role } = updateRoleSchema.parse(request.body);
      return usersService.updateRole(request.authUser.organizationId, request.authUser, id, role);
    }
  );

  fastify.patch(
    "/users/:id/status",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request) => {
      const { id } = request.params as { id: string };
      const { status } = updateStatusSchema.parse(request.body);
      return usersService.updateStatus(request.authUser.organizationId, request.authUser, id, status);
    }
  );

  fastify.delete(
    "/users/:id",
    { preHandler: fastify.requireRole("OWNER", "ADMIN") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await usersService.removeUser(request.authUser.organizationId, request.authUser, id);
      return reply.code(204).send();
    }
  );
}
