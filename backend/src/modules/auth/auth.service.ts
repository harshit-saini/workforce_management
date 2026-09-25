import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { generateOpaqueToken, hashToken, msFromDuration } from "../../lib/tokens.js";
import { config } from "../../lib/config.js";
import { sendEmail } from "../../lib/email.js";
import { z } from "zod";
import { signupSchema, loginSchema, acceptInviteSchema } from "./auth.schemas.js";
import { seedDefaultTaskStatuses } from "../../lib/defaultStatuses.js";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

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
    await seedDefaultTaskStatuses(tx, organization.id);
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

/**
 * Always resolves the same way regardless of whether the email matches an account, so the
 * response can't be used to enumerate registered emails. Any earlier outstanding reset token
 * for the user is invalidated so at most one link is ever valid at a time.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt || user.status !== "ACTIVE") return;

  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
  ]);

  const resetUrl = `${config.frontendUrl}/reset-password/${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your password",
    html: `
      <p>We received a request to reset the password for your account.</p>
      <p><a href="${resetUrl}">Choose a new password</a></p>
      <p>This link expires in 1 hour and can only be used once. If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    `,
  });
}

/** Read-only check used by the reset-password page to show an upfront "link expired" state without consuming the token. */
export async function isPasswordResetTokenValid(rawToken: string): Promise<boolean> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findFirst({ where: { tokenHash } });
  return !!record && !record.usedAt && record.expiresAt > new Date();
}

/**
 * Consumes a password-reset token exactly once and, since a reset implies the account may have
 * been at risk, revokes every existing refresh token so all other sessions are signed out.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findFirst({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.badRequest("This password reset link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
