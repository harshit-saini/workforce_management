import { z } from "zod";

/** The one canonical form of an email address: trimmed and lower-case, so "Tarun.Kumar@x.com" and "tarun.kumar@x.com" are the same person. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

/** Validates an email and stores it in canonical form. Use this for every email that comes from a request. */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
