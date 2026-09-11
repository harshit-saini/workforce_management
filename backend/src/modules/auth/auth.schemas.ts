import { z } from "zod";

export const signupSchema = z.object({
  organizationName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const acceptInviteSchema = z.object({
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});
