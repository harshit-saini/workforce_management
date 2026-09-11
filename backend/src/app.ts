import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { config } from "./lib/config.js";
import { AppError } from "./lib/errors.js";
import { ZodError } from "zod";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import centersRoutes from "./modules/centers/centers.routes.js";
import departmentsRoutes from "./modules/departments/departments.routes.js";
import hierarchyRoutes from "./modules/hierarchy/hierarchy.routes.js";
import tasksRoutes from "./modules/tasks/tasks.routes.js";
import overviewRoutes from "./modules/overview/overview.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";
import reportsRoutes from "./modules/reports/reports.routes.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: config.corsOrigin, credentials: true });
  app.register(multipart, { limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
  app.register(fastifyStatic, { root: path.resolve(config.uploadDir), prefix: "/uploads/" });
  app.register(authPlugin);

  app.register(authRoutes, { prefix: "/api" });
  app.register(usersRoutes, { prefix: "/api" });
  app.register(centersRoutes, { prefix: "/api" });
  app.register(departmentsRoutes, { prefix: "/api" });
  app.register(hierarchyRoutes, { prefix: "/api" });
  app.register(tasksRoutes, { prefix: "/api" });
  app.register(overviewRoutes, { prefix: "/api" });
  app.register(notificationsRoutes, { prefix: "/api" });
  app.register(reportsRoutes, { prefix: "/api" });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", message: error.issues.map((i) => i.message).join("; "), issues: error.issues });
    }
    request.log.error(error);
    const statusCode = (error as any).statusCode ?? 500;
    return reply.code(statusCode).send({ error: "INTERNAL_ERROR", message: statusCode === 500 ? "Something went wrong" : error.message });
  });

  return app;
}
