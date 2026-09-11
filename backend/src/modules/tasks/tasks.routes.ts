import { FastifyInstance } from "fastify";
import * as tasksService from "./tasks.service.js";
import { saveAttachment } from "./attachments.service.js";
import {
  createTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  addCommentSchema,
  logTimeSchema,
} from "./tasks.schemas.js";
import { resolveAccessibleUserIds, intersectScope } from "../../lib/scope.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

export default async function tasksRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/tasks", async (request) => {
    const query = listTasksQuerySchema.parse(request.query);
    const accessible = await resolveAccessibleUserIds(request.authUser);
    const scoped = intersectScope(accessible, query.assigneeId ? [query.assigneeId] : undefined);
    return tasksService.listTasks(request.authUser.organizationId, scoped, query);
  });

  fastify.get("/tasks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const accessible = await resolveAccessibleUserIds(request.authUser);
    return tasksService.getTaskOrThrow(request.authUser.organizationId, accessible, id);
  });

  fastify.post("/tasks", async (request, reply) => {
    const input = createTaskSchema.parse(request.body);
    const accessible = await resolveAccessibleUserIds(request.authUser);
    const task = await tasksService.createTask(request.authUser.organizationId, request.authUser, accessible, input);
    return reply.code(201).send(task);
  });

  fastify.post("/tasks/:id/subtasks", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = createTaskSchema.parse({ ...(request.body as object), parentTaskId: id });
    const accessible = await resolveAccessibleUserIds(request.authUser);
    const task = await tasksService.createTask(request.authUser.organizationId, request.authUser, accessible, input);
    await prisma.taskActivity.create({
      data: { taskId: id, userId: request.authUser.id, type: "SUBTASK_ADDED", message: "Added a subtask" },
    });
    return reply.code(201).send(task);
  });

  fastify.patch("/tasks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const input = updateTaskSchema.parse(request.body);
    const accessible = await resolveAccessibleUserIds(request.authUser);
    return tasksService.updateTask(request.authUser.organizationId, request.authUser, accessible, id, input);
  });

  fastify.delete("/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const accessible = await resolveAccessibleUserIds(request.authUser);
    await tasksService.deleteTask(request.authUser.organizationId, accessible, id);
    return reply.code(204).send();
  });

  fastify.post("/tasks/:id/comments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = addCommentSchema.parse(request.body);
    const accessible = await resolveAccessibleUserIds(request.authUser);
    const comment = await tasksService.addComment(
      request.authUser.organizationId,
      request.authUser,
      accessible,
      id,
      input
    );
    return reply.code(201).send(comment);
  });

  fastify.post("/tasks/:id/log", async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = logTimeSchema.parse(request.body);
    const accessible = await resolveAccessibleUserIds(request.authUser);
    const log = await tasksService.logTime(request.authUser.organizationId, request.authUser, accessible, id, input);
    return reply.code(201).send(log);
  });

  fastify.get("/tasks/:id/activity", async (request) => {
    const { id } = request.params as { id: string };
    const accessible = await resolveAccessibleUserIds(request.authUser);
    return tasksService.getActivity(request.authUser.organizationId, accessible, id);
  });

  fastify.post("/tasks/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const accessible = await resolveAccessibleUserIds(request.authUser);
    await tasksService.getTaskOrThrow(request.authUser.organizationId, accessible, id);

    const file = await request.file();
    if (!file) throw AppError.badRequest("No file provided");

    const query = request.query as { commentId?: string };
    const attachment = await saveAttachment(id, request.authUser.id, file, query.commentId);
    return reply.code(201).send(attachment);
  });
}
