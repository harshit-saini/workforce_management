import { prisma } from "./prisma.js";
import { AuthUser } from "../plugins/auth.js";
import { getDownlineUserIds } from "./hierarchy.js";

/**
 * Resolves the set of user ids the requester is allowed to see data for.
 * Returns `null` to mean "no restriction" (org-wide access: ADMIN/OWNER).
 * Otherwise returns an explicit list of user ids.
 */
export async function resolveAccessibleUserIds(authUser: AuthUser): Promise<string[] | null> {
  if (authUser.role === "ADMIN" || authUser.role === "OWNER") {
    return null;
  }

  const ids = new Set<string>([authUser.id]);

  if (authUser.role === "MANAGER") {
    const downline = await getDownlineUserIds(authUser.organizationId, authUser.id);
    downline.forEach((id) => ids.add(id));
  }

  if (authUser.isCenterHead && authUser.centerId) {
    const centerUsers = await prisma.user.findMany({
      where: { organizationId: authUser.organizationId, centerId: authUser.centerId, deletedAt: null },
      select: { id: true },
    });
    centerUsers.forEach((u) => ids.add(u.id));
  }

  return Array.from(ids);
}

/** Intersects the accessible-id scope with an optional requested subset (e.g. ?userId=). */
export function intersectScope(accessible: string[] | null, requested?: string[]): string[] | null {
  if (!requested || requested.length === 0) return accessible;
  if (accessible === null) return requested;
  const requestedSet = new Set(requested);
  return accessible.filter((id) => requestedSet.has(id));
}
