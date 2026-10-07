import { describe, it, expect } from "vitest";
import { normalizeEmail, emailSchema } from "../emailAddress.js";
import { loginSchema, signupSchema, forgotPasswordSchema } from "../../modules/auth/auth.schemas.js";
import { inviteUserSchema } from "../../modules/users/users.schemas.js";

describe("email addresses are not case-sensitive", () => {
  it("normalizeEmail trims and lower-cases", () => {
    expect(normalizeEmail("  Tarun.Kumar@Axtria.com ")).toBe("tarun.kumar@axtria.com");
  });

  it("the schema stores the canonical form and still rejects non-emails", () => {
    expect(emailSchema.parse("Tarun.kumar@axtria.com")).toBe("tarun.kumar@axtria.com");
    expect(emailSchema.parse("  TARUN.KUMAR@AXTRIA.COM  ")).toBe("tarun.kumar@axtria.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
    expect(emailSchema.safeParse("").success).toBe(false);
  });

  it("sign-in, sign-up, forgot-password and invites all normalize the address", () => {
    const typed = "Tarun.kumar@axtria.com";
    const want = "tarun.kumar@axtria.com";
    expect(loginSchema.parse({ email: typed, password: "x" }).email).toBe(want);
    expect(signupSchema.parse({ organizationName: "Axtria", name: "Tarun", email: typed, password: "longenough" }).email).toBe(want);
    expect(forgotPasswordSchema.parse({ email: typed }).email).toBe(want);
    expect(inviteUserSchema.parse({ email: typed }).email).toBe(want);
  });

  it("the person who signed up as Tarun.kumar@… and the one signing in as tarun.kumar@… end up with the same key", () => {
    const signedUpAs = signupSchema.parse({ organizationName: "Axtria", name: "T", email: "Tarun.kumar@axtria.com", password: "longenough" }).email;
    const signsInAs = loginSchema.parse({ email: "tarun.kumar@axtria.com", password: "x" }).email;
    expect(signedUpAs).toBe(signsInAs);
  });
});
