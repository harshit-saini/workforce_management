import { prisma } from "./prisma.js";

interface UserNode {
  id: string;
  managerId: string | null;
}

async function loadOrgUserGraph(organizationId: string): Promise<UserNode[]> {
  return prisma.user.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, managerId: true },
  });
}

/** Returns all descendant user ids (direct + indirect reports) of rootUserId, excluding rootUserId itself. */
export async function getDownlineUserIds(organizationId: string, rootUserId: string): Promise<string[]> {
  const users = await loadOrgUserGraph(organizationId);
  const childrenByManager = new Map<string, string[]>();
  for (const u of users) {
    if (!u.managerId) continue;
    const list = childrenByManager.get(u.managerId) ?? [];
    list.push(u.id);
    childrenByManager.set(u.managerId, list);
  }

  const result: string[] = [];
  const queue = [...(childrenByManager.get(rootUserId) ?? [])];
  const seen = new Set<string>(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const child of childrenByManager.get(current) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }

  return result;
}

/** Returns the reporting chain upward from userId (manager, manager's manager, ...), excluding userId itself. */
export async function getReportingChainUp(organizationId: string, userId: string): Promise<string[]> {
  const users = await loadOrgUserGraph(organizationId);
  const byId = new Map(users.map((u) => [u.id, u]));

  const chain: string[] = [];
  let current = byId.get(userId);
  const seen = new Set<string>([userId]);

  while (current?.managerId) {
    if (seen.has(current.managerId)) break; // defensive: broken cycle in data
    chain.push(current.managerId);
    seen.add(current.managerId);
    current = byId.get(current.managerId);
  }

  return chain;
}

/**
 * Returns true if setting `userId`'s manager to `candidateManagerId` would create a cycle,
 * i.e. candidateManagerId is userId itself or already a descendant of userId.
 */
export async function wouldCreateCycle(
  organizationId: string,
  userId: string,
  candidateManagerId: string
): Promise<boolean> {
  if (userId === candidateManagerId) return true;
  const downline = await getDownlineUserIds(organizationId, userId);
  return downline.includes(candidateManagerId);
}
