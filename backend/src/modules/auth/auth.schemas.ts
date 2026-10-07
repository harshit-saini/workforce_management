import { z } from "zod";
import { emailSchema } from "../../lib/emailAddress.js";

export const signupSchema = z.object({
  organizationName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: emailSchema,
  password: z.string().min(8).max(128),
  // The browser's IANA timezone (e.g. "Asia/Kolkata"), used for the first center. Ignored if not a real zone.
  timezone: z
    .string()
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    })
    .optional()
    .catch(undefined),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const acceptInviteSchema = z.object({
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(128),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});
