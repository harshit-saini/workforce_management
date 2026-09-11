import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  organizationId: string;
  role: Role;
  centerId: string | null;
  departmentId: string | null;
  managerId: string | null;
  isCenterHead: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: config.jwt.accessSecret,
    sign: { expiresIn: config.jwt.accessTtl },
  });

  fastify.decorate("authenticate", async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw AppError.unauthorized("Invalid or missing access token");
    }

    const payload = request.user as { sub: string; orgId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || user.deletedAt || user.organizationId !== payload.orgId) {
      throw AppError.unauthorized("Account no longer valid");
    }
    if (user.status !== "ACTIVE") {
      throw AppError.forbidden("Account is not active");
    }

    request.authUser = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      centerId: user.centerId,
      departmentId: user.departmentId,
      managerId: user.managerId,
      isCenterHead: user.isCenterHead,
    };
  });

  fastify.decorate("requireRole", (...roles: Role[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.authUser || !roles.includes(request.authUser.role)) {
        throw AppError.forbidden("You do not have permission to perform this action");
      }
    };
  });
});
