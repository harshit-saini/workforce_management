import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../lib/errors.js";
import { getDownlineUserIds, getReportingChainUp } from "../../lib/hierarchy.js";
import * as usersService from "../users/users.service.js";
import { AuthUser } from "../../plugins/auth.js";

const nodeSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  title: true,
  role: true,
  managerId: true,
  centerId: true,
  departmentId: true,
  status: true,
} as const;

export async function getTree(organizationId: string) {
  const users = await prisma.user.findMany({
    where: { organizationId, deletedAt: null },
    select: nodeSelect,
    orderBy: { name: "asc" },
  });

  const byId = new Map(users.map((u) => [u.id, { ...u, reports: [] as any[] }]));
  const roots: (typeof users[number] & { reports: any[] })[] = [];

  for (const user of byId.values()) {
    if (user.managerId && byId.has(user.managerId)) {
      byId.get(user.managerId)!.reports.push(user);
    } else {
      roots.push(user);
    }
  }

  return roots;
}

export async function getDirectReports(organizationId: string, userId: string) {
  return prisma.user.findMany({
    where: { organizationId, managerId: userId, deletedAt: null },
    select: nodeSelect,
    orderBy: { name: "asc" },
  });
}

export async function getDownline(organizationId: string, userId: string) {
  const ids = await getDownlineUserIds(organizationId, userId);
  if (ids.length === 0) return [];
  return prisma.user.findMany({ where: { id: { in: ids } }, select: nodeSelect, orderBy: { name: "asc" } });
}

export async function getReportingChain(organizationId: string, userId: string) {
  const ids = await getReportingChainUp(organizationId, userId);
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: nodeSelect });
  const byId = new Map(users.map((u) => [u.id, u]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export async function reassignManager(
  organizationId: string,
  actor: AuthUser,
  userId: string,
  managerId: string | null
) {
  return usersService.adminUpdateUser(organizationId, actor, userId, { managerId });
}

interface CsvRow {
  email: string;
  managerEmail?: string;
  department?: string;
  title?: string;
  center?: string;
}

function parseCsv(csv: string): CsvRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    rows.push({
      email: row.email,
      managerEmail: row["manager's email"] || row["manageremail"] || row.manager,
      department: row.department,
      title: row.title,
      center: row.center,
    });
  }

  return rows;
}

export async function importHierarchyCsv(organizationId: string, actor: AuthUser, csv: string) {
  const rows = parseCsv(csv);
  const errors: { row: number; email: string; reason: string }[] = [];
  let updated = 0;

  const centers = await prisma.center.findMany({ where: { organizationId } });
  const departments = await prisma.department.findMany({ where: { organizationId } });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.email) throw new Error("Missing email");
      const user = await prisma.user.findFirst({ where: { organizationId, email: row.email, deletedAt: null } });
      if (!user) throw new Error("No matching user for this email");

      let managerId: string | null | undefined = undefined;
      if (row.managerEmail) {
        const manager = await prisma.user.findFirst({
          where: { organizationId, email: row.managerEmail, deletedAt: null },
        });
        if (!manager) throw new Error(`Manager email "${row.managerEmail}" not found`);
        managerId = manager.id;
      }

      let departmentId: string | undefined;
      if (row.department) {
        let dept = departments.find((d) => d.name.toLowerCase() === row.department!.toLowerCase());
        if (!dept) {
          dept = await prisma.department.create({ data: { organizationId, name: row.department } });
          departments.push(dept);
        }
        departmentId = dept.id;
      }

      let centerId: string | undefined;
      if (row.center) {
        const center = centers.find(
          (c) => c.code.toLowerCase() === row.center!.toLowerCase() || c.name.toLowerCase() === row.center!.toLowerCase()
        );
        if (!center) throw new Error(`Center "${row.center}" not found`);
        centerId = center.id;
      }

      await usersService.adminUpdateUser(organizationId, actor, user.id, {
        ...(managerId !== undefined ? { managerId } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(centerId ? { centerId } : {}),
        ...(row.title ? { title: row.title } : {}),
      });
      updated += 1;
    } catch (err: any) {
      errors.push({ row: i + 2, email: row.email, reason: err.message ?? "Unknown error" });
    }
  }

  return { updated, errors };
}
