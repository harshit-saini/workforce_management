import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { generateOpaqueToken, hashToken, msFromDuration } from "../../lib/tokens.js";
import { config } from "../../lib/config.js";
import { z } from "zod";
import { signupSchema, loginSchema, acceptInviteSchema } from "./auth.schemas.js";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let suffix = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
  }
}

export async function signup(input: z.infer<typeof signupSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw AppError.conflict("An account with this email already exists");

  const slug = await uniqueSlug(input.organizationName);
  const passwordHash = await bcrypt.hash(input.password, 10);

  const { organization, user } = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: input.organizationName, slug },
    });
    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: input.email,
        name: input.name,
        passwordHash,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    return { organization, user };
  });

  return { organization, user };
}

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.deletedAt) throw AppError.unauthorized("Invalid email or password");
  if (user.status !== "ACTIVE") throw AppError.forbidden("Your account is not active. Contact your admin.");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw AppError.unauthorized("Invalid email or password");

  return user;
}

export async function issueRefreshToken(userId: string) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + msFromDuration(config.jwt.refreshTtl));
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return token;
}

export async function rotateRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.refreshToken.findFirst({ where: { tokenHash } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") {
    throw AppError.unauthorized("Account no longer valid");
  }

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  const newToken = await issueRefreshToken(user.id);
  return { user, refreshToken: newToken };
}

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function acceptInvite(token: string, input: z.infer<typeof acceptInviteSchema>) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    throw AppError.badRequest("Invite is invalid or has expired");
  }

  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) throw AppError.conflict("An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        organizationId: invite.organizationId,
        email: invite.email,
        name: input.name,
        passwordHash,
        role: invite.role,
        centerId: invite.centerId,
        departmentId: invite.departmentId,
        managerId: invite.managerId,
        title: invite.title,
        status: "ACTIVE",
      },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return created;
  });

  return user;
}
