import { FastifyInstance } from "fastify";
import { signupSchema, loginSchema, refreshSchema, acceptInviteSchema, forgotPasswordSchema, resetPasswordSchema } from "./auth.schemas.js";
import * as authService from "./auth.service.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";

function serializeUser(user: {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  centerId: string | null;
  departmentId: string | null;
  title: string | null;
}) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    centerId: user.centerId,
    departmentId: user.departmentId,
    title: user.title,
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/auth/signup", async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const { user } = await authService.signup(input);
    const accessToken = await reply.jwtSign({ sub: user.id, orgId: user.organizationId, role: user.role });
    const refreshToken = await authService.issueRefreshToken(user.id);
    return reply.code(201).send({ accessToken, refreshToken, user: serializeUser(user) });
  });

  fastify.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await authService.login(input);
    const accessToken = await reply.jwtSign({ sub: user.id, orgId: user.organizationId, role: user.role });
    const refreshToken = await authService.issueRefreshToken(user.id);
    return reply.send({ accessToken, refreshToken, user: serializeUser(user) });
  });

  fastify.post("/auth/refresh", async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const { user, refreshToken } = await authService.rotateRefreshToken(input.refreshToken);
    const accessToken = await reply.jwtSign({ sub: user.id, orgId: user.organizationId, role: user.role });
    return reply.send({ accessToken, refreshToken, user: serializeUser(user) });
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    await authService.revokeRefreshToken(input.refreshToken);
    return reply.code(204).send();
  });

  fastify.get("/auth/invite/:token", async (request) => {
    const { token } = request.params as { token: string };
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw AppError.badRequest("Invite is invalid or has expired");
    }
    return {
      email: invite.email,
      role: invite.role,
      organizationId: invite.organizationId,
      expiresAt: invite.expiresAt,
    };
  });

  fastify.post("/auth/invite/:token/accept", async (request, reply) => {
    const { token } = request.params as { token: string };
    const input = acceptInviteSchema.parse(request.body);
    const user = await authService.acceptInvite(token, input);
    const accessToken = await reply.jwtSign({ sub: user.id, orgId: user.organizationId, role: user.role });
    const refreshToken = await authService.issueRefreshToken(user.id);
    return reply.code(201).send({ accessToken, refreshToken, user: serializeUser(user) });
  });

  fastify.post(
    "/auth/forgot-password",
    {
      config: {
        // Keyed by the target email (not just IP) so the limit follows the victim, not the
        // attacker — this is what actually stops someone from mail-bombing a chosen inbox.
        rateLimit: {
          max: 3,
          timeWindow: "15 minutes",
          // Body isn't parsed yet at the default 'onRequest' hook — run at 'preHandler' so
          // request.body.email is available to the key generator below.
          hook: "preHandler",
          keyGenerator: (request: any) => `forgot-password:${request.body?.email ?? request.ip}`,
        },
      },
    },
    async (request, reply) => {
      const input = forgotPasswordSchema.parse(request.body);
      await authService.requestPasswordReset(input.email);
      // Identical response whether or not the email is registered, to avoid account enumeration.
      return reply.send({ message: "If an account exists for that email, a reset link has been sent." });
    }
  );

  fastify.get(
    "/auth/reset-password/:token",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request) => {
      const { token } = request.params as { token: string };
      const valid = await authService.isPasswordResetTokenValid(token);
      if (!valid) throw AppError.badRequest("This password reset link is invalid or has expired");
      return { valid: true };
    }
  );

  fastify.post(
    "/auth/reset-password/:token",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const { token } = request.params as { token: string };
      const input = resetPasswordSchema.parse(request.body);
      await authService.resetPassword(token, input.password);
      return reply.code(204).send();
    }
  );

  fastify.get("/users/me", { preHandler: fastify.authenticate }, async (request) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.authUser.id } });
    return serializeUser(user);
  });
}
