import { FastifyInstance } from "fastify";
import * as notificationsService from "./notifications.service.js";
import { listNotificationsQuerySchema, updatePreferenceSchema, nudgeSchema } from "./notifications.schemas.js";

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/notifications", async (request) => {
    const query = listNotificationsQuerySchema.parse(request.query);
    return notificationsService.listNotifications(request.authUser.id, query);
  });

  fastify.patch("/notifications/:id/read", async (request) => {
    const { id } = request.params as { id: string };
    return notificationsService.markRead(request.authUser.id, id);
  });

  fastify.post("/notifications/read-all", async (request, reply) => {
    await notificationsService.markAllRead(request.authUser.id);
    return reply.code(204).send();
  });

  fastify.get("/notifications/preferences", async (request) => {
    return notificationsService.listPreferences(request.authUser.id);
  });

  fastify.patch("/notifications/preferences", async (request) => {
    const input = updatePreferenceSchema.parse(request.body);
    return notificationsService.updatePreference(request.authUser.id, input);
  });

  fastify.post("/notifications/nudge", async (request, reply) => {
    const input = nudgeSchema.parse(request.body);
    const notification = await notificationsService.sendNudge(request.authUser.organizationId, request.authUser, input);
    return reply.code(201).send(notification);
  });
}
