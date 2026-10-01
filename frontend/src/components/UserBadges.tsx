import { Role, UserStatus } from "@/types";

const ROLE: Record<Role, { label: string; className: string }> = {
  OWNER: { label: "Owner", className: "bg-purple-50 text-purple-800 ring-purple-200" },
  ADMIN: { label: "Admin", className: "bg-blue-50 text-blue-800 ring-blue-200" },
  MANAGER: { label: "Manager", className: "bg-teal-50 text-teal-800 ring-teal-200" },
  EMPLOYEE: { label: "Employee", className: "bg-gray-100 text-gray-700 ring-gray-200" },
};

const STATUS: Record<string, { label: string; className: string; dot: string }> = {
  ACTIVE: { label: "Active", className: "bg-green-50 text-green-800 ring-green-200", dot: "bg-green-600" },
  INACTIVE: { label: "Inactive", className: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-600" },
  ON_LEAVE: { label: "On leave", className: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-600" },
};

const base = "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function RoleBadge({ role }: { role: Role }) {
  const r = ROLE[role];
  return <span className={`${base} ${r.className}`}>{r.label}</span>;
}

/** The dot plus the word, so status never relies on color alone. */
export function UserStatusBadge({ status }: { status?: UserStatus | string }) {
  const s = STATUS[status ?? "ACTIVE"] ?? STATUS.ACTIVE;
  return (
    <span className={`${base} ${s.className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
