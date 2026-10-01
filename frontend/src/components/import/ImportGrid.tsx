import { ReactNode, memo, useMemo } from "react";
import clsx from "clsx";
import { ImportCellIssue, ImportField, ImportOptions, ImportRow, ImportRowResult } from "@/types";
import ComboCell, { ComboOption } from "@/components/import/ComboCell";
import { IconX } from "@/components/icons";

export const FIELD_LABELS: Record<ImportField, string> = {
  title: "Title",
  description: "Description",
  assigneeEmail: "Assignee Email",
  center: "Center",
  department: "Department",
  status: "Status",
  priority: "Priority",
  dueDate: "Due Date",
  estimatedHours: "Est. Hours",
  tags: "Tags",
};

export function cellId(rowNumber: number, field: ImportField) {
  return `import-cell-${rowNumber}-${field}`;
}

type CellIssue = { severity: "error" | "warning"; message: string };

/** Collapses a field's issues into one indicator: the worst severity, all messages. */
function groupIssues(issues: ImportCellIssue[] | undefined): Partial<Record<ImportField, CellIssue>> {
  const grouped: Partial<Record<ImportField, CellIssue>> = {};
  for (const issue of issues ?? []) {
    const existing = grouped[issue.field];
    grouped[issue.field] = existing
      ? {
          severity: existing.severity === "error" || issue.severity === "error" ? "error" : "warning",
          message: `${existing.message}\n${issue.message}`,
        }
      : { severity: issue.severity, message: issue.message };
  }
  return grouped;
}

function Cell({ issue, children, className, sticky }: { issue?: CellIssue; children: ReactNode; className?: string; sticky?: string }) {
  const tone = issue?.severity === "error" ? "bg-red-50" : issue?.severity === "warning" ? "bg-amber-50" : "bg-white";
  return (
    <td className={clsx("relative border border-gray-200 p-0 align-middle", tone, sticky, className)} title={issue?.message}>
      {issue && (
        // Excel-style corner marker
        <span
          aria-hidden
          className={clsx(
            "pointer-events-none absolute top-0 left-0 w-0 h-0 border-t-[8px] border-r-[8px] border-r-transparent",
            issue.severity === "error" ? "border-t-red-500" : "border-t-amber-500"
          )}
        />
      )}
      {children}
    </td>
  );
}

const inputClass =
  "w-full h-full min-h-[34px] px-2 py-1.5 bg-transparent text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500";

function TextCell({ id, value, onChange, placeholder, inputMode }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: "decimal";
}) {
  return (
    <input
      id={id}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}

function DateCell({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  // A native date input can't display an unparseable value (it would look blank), so show the
  // raw text from the file until it's cleared or fixed.
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return <TextCell id={id} value={value} onChange={onChange} placeholder="YYYY-MM-DD" />;
  }
  return <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
}

export interface GridLookups {
  users: ComboOption[];
  centers: ComboOption[];
  departments: ComboOption[];
  statuses: ComboOption[];
  priorities: ComboOption[];
  userNameByEmail: Map<string, string>;
  defaultStatusLabel: string;
}

export function buildGridLookups(options: ImportOptions): GridLookups {
  return {
    users: options.users.map((u) => ({ value: u.email, label: u.name, sublabel: u.email })),
    centers: options.centers.map((c) => ({ value: c.name, label: c.name, sublabel: c.code })),
    departments: options.departments.map((d) => ({ value: d.name, label: d.name })),
    statuses: options.statuses.map((s) => ({ value: s.key, label: s.label })),
    priorities: options.priorities.map((p) => ({ value: p.value, label: p.label })),
    userNameByEmail: new Map(options.users.map((u) => [u.email.toLowerCase(), u.name])),
    defaultStatusLabel: options.defaultStatus.label,
  };
}

const GridRow = memo(function GridRow({
  row,
  result,
  lookups,
  onChange,
  onRemove,
}: {
  row: ImportRow;
  result: ImportRowResult | undefined;
  lookups: GridLookups;
  onChange: (rowNumber: number, field: ImportField, value: string) => void;
  onRemove: (rowNumber: number) => void;
}) {
  const issues = useMemo(() => groupIssues(result?.issues), [result]);
  const hasError = result?.issues.some((i) => i.severity === "error");
  const hasWarning = !hasError && (result?.issues.length ?? 0) > 0;
  const set = (field: ImportField) => (value: string) => onChange(row.rowNumber, field, value);
  const id = (field: ImportField) => cellId(row.rowNumber, field);
  const assigneeName = row.assigneeEmail ? lookups.userNameByEmail.get(row.assigneeEmail.toLowerCase()) : undefined;

  return (
    <tr>
      <td
        className={clsx(
          "sticky left-0 z-10 w-12 border border-gray-200 bg-gray-50 text-center text-xs font-medium",
          hasError ? "text-red-600" : hasWarning ? "text-amber-600" : "text-subtle"
        )}
      >
        {row.rowNumber}
      </td>
      <Cell issue={issues.title} sticky="sticky left-12 z-10">
        <TextCell id={id("title")} value={row.title} onChange={set("title")} placeholder="Required" />
      </Cell>
      <Cell issue={issues.description}>
        <TextCell id={id("description")} value={row.description} onChange={set("description")} />
      </Cell>
      <Cell issue={issues.assigneeEmail}>
        <ComboCell
          id={id("assigneeEmail")}
          value={row.assigneeEmail}
          options={lookups.users}
          emptyLabel="Unassigned"
          showValue
          onChange={set("assigneeEmail")}
        />
      </Cell>
      <td className="border border-gray-200 bg-gray-50 px-2 text-sm" title="Filled in from the email — change the email to change the assignee">
        {assigneeName ? (
          <span className="text-gray-700">{assigneeName}</span>
        ) : (
          <span className="italic text-subtle">{row.assigneeEmail ? "Not found" : "Unassigned"}</span>
        )}
      </td>
      <Cell issue={issues.center}>
        <ComboCell id={id("center")} value={row.center} options={lookups.centers} emptyLabel="Assignee's center" onChange={set("center")} />
      </Cell>
      <Cell issue={issues.department}>
        <ComboCell id={id("department")} value={row.department} options={lookups.departments} emptyLabel="No department" onChange={set("department")} />
      </Cell>
      <Cell issue={issues.status}>
        <ComboCell
          id={id("status")}
          value={row.status}
          options={lookups.statuses}
          emptyLabel={`Default (${lookups.defaultStatusLabel})`}
          onChange={set("status")}
        />
      </Cell>
      <Cell issue={issues.priority}>
        <ComboCell id={id("priority")} value={row.priority} options={lookups.priorities} emptyLabel="Default (Medium)" onChange={set("priority")} />
      </Cell>
      <Cell issue={issues.dueDate}>
        <DateCell id={id("dueDate")} value={row.dueDate} onChange={set("dueDate")} />
      </Cell>
      <Cell issue={issues.estimatedHours}>
        <TextCell id={id("estimatedHours")} value={row.estimatedHours} onChange={set("estimatedHours")} inputMode="decimal" />
      </Cell>
      <Cell issue={issues.tags}>
        <TextCell id={id("tags")} value={row.tags} onChange={set("tags")} placeholder="comma, separated" />
      </Cell>
      <td className="border border-gray-200 bg-white text-center">
        <button
          type="button"
          onClick={() => onRemove(row.rowNumber)}
          className="p-1.5 text-subtle hover:text-red-600"
          title={`Remove row ${row.rowNumber} from this import`}
          aria-label={`Remove row ${row.rowNumber}`}
        >
          <IconX className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

const HEADERS: { label: string; width: number; sticky?: string; readOnly?: boolean }[] = [
  { label: "#", width: 48, sticky: "sticky left-0 z-30" },
  { label: "Title *", width: 240, sticky: "sticky left-12 z-30" },
  { label: "Description", width: 220 },
  { label: "Assignee Email", width: 230 },
  { label: "Assignee", width: 160, readOnly: true },
  { label: "Center", width: 160 },
  { label: "Department", width: 150 },
  { label: "Status", width: 150 },
  { label: "Priority", width: 130 },
  { label: "Due Date", width: 150 },
  { label: "Est. Hours", width: 100 },
  { label: "Tags", width: 180 },
  { label: "", width: 40 },
];

export default function ImportGrid({
  rows,
  results,
  lookups,
  onChange,
  onRemove,
}: {
  rows: ImportRow[];
  results: Record<number, ImportRowResult>;
  lookups: GridLookups;
  onChange: (rowNumber: number, field: ImportField, value: string) => void;
  onRemove: (rowNumber: number) => void;
}) {
  return (
    <div className="overflow-auto max-h-[65vh] rounded-lg border border-gray-200 bg-white">
      <table className="border-collapse text-sm" style={{ minWidth: HEADERS.reduce((sum, h) => sum + h.width, 0) }}>
        <thead>
          <tr>
            {HEADERS.map((h, i) => (
              <th
                key={i}
                style={{ width: h.width, minWidth: h.width }}
                className={clsx(
                  "sticky top-0 border border-gray-200 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide",
                  h.readOnly ? "bg-gray-200/70 text-gray-500" : "bg-gray-100 text-gray-600",
                  h.sticky ?? "z-20"
                )}
                title={h.readOnly ? "Read-only — filled in from the assignee email" : undefined}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <GridRow
              key={row.rowNumber}
              row={row}
              result={results[row.rowNumber]}
              lookups={lookups}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
