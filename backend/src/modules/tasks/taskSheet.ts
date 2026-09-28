import ExcelJS from "exceljs";
import { StatusCategory, TaskPriority } from "@prisma/client";
import { AppError } from "../../lib/errors.js";

export const MAX_IMPORT_ROWS = 1000;
/** Rows in the template that get in-file dropdowns / date formatting. */
const TEMPLATE_ROWS = MAX_IMPORT_ROWS;

export const IMPORT_FIELDS = [
  "title",
  "description",
  "assigneeEmail",
  "center",
  "department",
  "status",
  "priority",
  "dueDate",
  "estimatedHours",
  "tags",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** One spreadsheet row as editable text. `rowNumber` is the row in the uploaded file and doubles as the row's id. */
export type ImportRow = { rowNumber: number } & Record<ImportField, string>;

const COLUMNS: { field: ImportField; header: string; width: number; aliases: string[] }[] = [
  { field: "title", header: "Title *", width: 40, aliases: ["title", "task", "tasktitle", "taskname"] },
  { field: "description", header: "Description", width: 50, aliases: ["description", "details"] },
  { field: "assigneeEmail", header: "Assignee Email", width: 32, aliases: ["assigneeemail", "assignee", "assignedto", "email"] },
  { field: "center", header: "Center", width: 22, aliases: ["center", "centre"] },
  { field: "department", header: "Department", width: 22, aliases: ["department", "dept"] },
  { field: "status", header: "Status", width: 18, aliases: ["status"] },
  { field: "priority", header: "Priority", width: 12, aliases: ["priority"] },
  { field: "dueDate", header: "Due Date", width: 14, aliases: ["duedate", "due", "deadline"] },
  { field: "estimatedHours", header: "Estimated Hours", width: 16, aliases: ["estimatedhours", "esthours", "hours", "estimate"] },
  { field: "tags", header: "Tags", width: 28, aliases: ["tags", "labels"] },
];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_HOURS = 10000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

// ─── Reading ──────────────────────────────────────────────────────────────

function normalizeHeader(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchHeader(text: string): ImportField | null {
  const key = normalizeHeader(text);
  if (!key) return null;
  return COLUMNS.find((c) => c.aliases.includes(key))?.field ?? null;
}

function toIsoDate(date: Date): string {
  // exceljs represents an Excel calendar date as UTC midnight, so read the UTC parts.
  return date.toISOString().slice(0, 10);
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  return new Date(Math.round((serial - 25569) * 86_400_000));
}

/** Flattens every exceljs cell value shape (rich text, hyperlinks, formulas, dates…) to plain trimmed text. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return toIsoDate(value);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    // Excel auto-links typed emails, so these are common in the assignee column.
    if ("hyperlink" in value) {
      const text = "text" in value && value.text ? cellText(value.text as ExcelJS.CellValue) : "";
      return text || String(value.hyperlink).replace(/^mailto:/i, "").trim();
    }
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value).trim();
}

function dateCellText(value: ExcelJS.CellValue): string {
  if (typeof value === "number") {
    const date = excelSerialToDate(value);
    return date ? toIsoDate(date) : String(value);
  }
  if (value && typeof value === "object" && !(value instanceof Date) && "result" in value) {
    return dateCellText(value.result as ExcelJS.CellValue);
  }
  return cellText(value);
}

function emptyRow(rowNumber: number): ImportRow {
  const row = { rowNumber } as ImportRow;
  for (const field of IMPORT_FIELDS) row[field] = "";
  return row;
}

/** Parses the "Tasks" sheet (or the first sheet) by header name, so column order and extra columns don't matter. */
export async function readTaskSheet(buffer: Buffer): Promise<ImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's bundled `Buffer` type predates the generic Node Buffer typing; a Node Buffer is accepted at runtime.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw AppError.badRequest("Couldn't read this file. Upload an .xlsx file (Excel 2007 or later).");
  }

  const sheet = workbook.getWorksheet("Tasks") ?? workbook.worksheets[0];
  if (!sheet) throw AppError.badRequest("The workbook doesn't contain any sheets.");

  const fieldByColumn = new Map<number, ImportField>();
  sheet.getRow(1).eachCell((cell, column) => {
    const field = matchHeader(cellText(cell.value));
    if (field && ![...fieldByColumn.values()].includes(field)) fieldByColumn.set(column, field);
  });
  if (![...fieldByColumn.values()].includes("title")) {
    throw AppError.badRequest('Couldn\'t find a "Title" column in the first row. Download the template to see the expected format.');
  }

  const rows: ImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const sheetRow = sheet.getRow(rowNumber);
    const row = emptyRow(rowNumber);
    let hasContent = false;
    for (const [column, field] of fieldByColumn) {
      const value = sheetRow.getCell(column).value;
      row[field] = field === "dueDate" ? dateCellText(value) : cellText(value);
      if (row[field]) hasContent = true;
    }
    if (!hasContent) continue;
    rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS) {
      throw AppError.badRequest(`This file has more than ${MAX_IMPORT_ROWS} task rows. Split it into smaller files.`);
    }
  }
  return rows;
}

// ─── Validation ───────────────────────────────────────────────────────────

export interface ImportLookups {
  /** Keyed by lowercased email. */
  users: Map<string, { id: string; name: string; email: string; centerId: string | null }>;
  /** Keyed by lowercased name and by lowercased code. */
  centers: Map<string, { id: string; name: string }>;
  /** Keyed by lowercased name. */
  departments: Map<string, { id: string; name: string }>;
  /** Keyed by lowercased key and by lowercased label. */
  statuses: Map<string, { key: string; label: string; category: StatusCategory }>;
  defaultStatus: { key: string; label: string; category: StatusCategory };
}

export interface CellIssue {
  field: ImportField;
  /** "error" blocks the import; "warning" means a fallback value will be used. */
  severity: "error" | "warning";
  message: string;
}

export interface ResolvedImportTask {
  title: string;
  description: string | null;
  assigneeId: string | null;
  centerId: string | null;
  departmentId: string | null;
  statusKey: string;
  statusCategory: StatusCategory;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedHours: number | null;
  tags: string[];
}

export interface ValidatedImportRow {
  rowNumber: number;
  /** Read-only display name of the matched assignee. */
  assigneeName: string | null;
  issues: CellIssue[];
  /** The row with lookup values rewritten to their canonical form (e.g. "noida" → "Noida Center"). */
  normalized: ImportRow;
  /** What would be created, or null when the row has a blocking error. */
  task: ResolvedImportTask | null;
}

function parseIsoDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects impossible dates like 2026-02-30, which Date would silently roll over.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function validateImportRow(row: ImportRow, lookups: ImportLookups): ValidatedImportRow {
  const issues: CellIssue[] = [];
  const normalized: ImportRow = { ...row };
  const error = (field: ImportField, message: string) => issues.push({ field, severity: "error", message });
  const warning = (field: ImportField, message: string) => issues.push({ field, severity: "warning", message });

  const title = row.title.trim();
  if (!title) error("title", "Title is required");
  else if (title.length > MAX_TITLE) error("title", `Title must be ${MAX_TITLE} characters or fewer`);

  const description = row.description.trim();
  if (description.length > MAX_DESCRIPTION) error("description", "Description must be 5,000 characters or fewer");

  const email = row.assigneeEmail.trim().toLowerCase();
  const assignee = email ? lookups.users.get(email) ?? null : null;
  if (assignee) normalized.assigneeEmail = assignee.email;
  else if (email) {
    warning("assigneeEmail", "No active user with this email in your organization — pick someone, or the task will be created unassigned");
  }

  const centerKey = row.center.trim().toLowerCase();
  const center = centerKey ? lookups.centers.get(centerKey) ?? null : null;
  if (center) normalized.center = center.name;
  else if (centerKey) warning("center", "Center not found — pick one, or it will default to the assignee's center");

  const departmentKey = row.department.trim().toLowerCase();
  const department = departmentKey ? lookups.departments.get(departmentKey) ?? null : null;
  if (department) normalized.department = department.name;
  else if (departmentKey) warning("department", "Department not found — pick one, or the task will have no department");

  const statusKey = row.status.trim().toLowerCase();
  const matchedStatus = statusKey ? lookups.statuses.get(statusKey) ?? null : null;
  if (matchedStatus) normalized.status = matchedStatus.key;
  else if (statusKey) warning("status", `Status not found — pick one, or "${lookups.defaultStatus.label}" will be used`);
  const status = matchedStatus ?? lookups.defaultStatus;

  const priorityText = row.priority.trim().toUpperCase();
  const priorityValid = priorityText in TaskPriority;
  if (priorityValid) normalized.priority = priorityText;
  else if (priorityText) warning("priority", "Priority must be Low, Medium, High or Urgent — Medium will be used");
  const priority = priorityValid ? (priorityText as TaskPriority) : TaskPriority.MEDIUM;

  const dueText = row.dueDate.trim();
  const dueDate = dueText ? parseIsoDate(dueText) : null;
  if (dueText && !dueDate) warning("dueDate", "Use a date like 2026-10-31 — otherwise no due date will be set");

  const hoursText = row.estimatedHours.trim();
  let estimatedHours: number | null = null;
  if (hoursText) {
    const hours = Number(hoursText);
    if (Number.isFinite(hours) && hours >= 0 && hours <= MAX_HOURS) estimatedHours = hours;
    else warning("estimatedHours", "Estimated hours must be a number from 0 to 10,000 — it will be left blank");
  }

  const seenTags = new Set<string>();
  const tags: string[] = [];
  const droppedTags: string[] = [];
  for (const raw of row.tags.split(",")) {
    const tag = raw.trim();
    if (!tag || seenTags.has(tag.toLowerCase())) continue;
    seenTags.add(tag.toLowerCase());
    if (tag.length > MAX_TAG_LENGTH) droppedTags.push(tag);
    else tags.push(tag);
  }
  if (droppedTags.length > 0) warning("tags", `Tags longer than ${MAX_TAG_LENGTH} characters will be dropped`);
  if (tags.length > MAX_TAGS) warning("tags", `Only the first ${MAX_TAGS} tags will be kept`);

  const hasError = issues.some((issue) => issue.severity === "error");
  return {
    rowNumber: row.rowNumber,
    assigneeName: assignee?.name ?? null,
    issues,
    normalized,
    task: hasError
      ? null
      : {
          title,
          description: description || null,
          assigneeId: assignee?.id ?? null,
          centerId: center?.id ?? assignee?.centerId ?? null,
          departmentId: department?.id ?? null,
          statusKey: status.key,
          statusCategory: status.category,
          priority,
          dueDate,
          estimatedHours,
          tags: tags.slice(0, MAX_TAGS),
        },
  };
}

export function summarizeValidation(rows: ValidatedImportRow[]) {
  const errorRows = rows.filter((r) => r.issues.some((i) => i.severity === "error")).length;
  const warningRows = rows.filter((r) => r.issues.length > 0 && !r.issues.some((i) => i.severity === "error")).length;
  return { total: rows.length, errorRows, warningRows };
}

// ─── Writing ──────────────────────────────────────────────────────────────

// exceljs supports range-level validations at runtime (`worksheet.dataValidations.add`), but its
// type definitions only declare the per-cell `cell.dataValidation`.
type WorksheetWithValidations = ExcelJS.Worksheet & {
  dataValidations: { add(range: string, validation: ExcelJS.DataValidation): void };
};

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F5" } };
  header.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export interface TemplateLists {
  emails: string[];
  centers: string[];
  departments: string[];
  statuses: string[];
}

/**
 * A "Tasks" sheet with in-file dropdowns sourced from a hidden "Lists" sheet (Excel caps inline
 * dropdown lists at 255 characters, so large user lists must come from a range), plus instructions.
 */
export async function buildTemplateWorkbook(lists: TemplateLists): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Workforce Management";

  const tasks = workbook.addWorksheet("Tasks") as WorksheetWithValidations;
  tasks.columns = COLUMNS.map((c) => ({ header: c.header, key: c.field, width: c.width }));
  styleHeaderRow(tasks);

  const listSheet = workbook.addWorksheet("Lists", { state: "hidden" });
  const listColumns: { field: ImportField; header: string; values: string[] }[] = [
    { field: "assigneeEmail", header: "Assignee Email", values: lists.emails },
    { field: "center", header: "Center", values: lists.centers },
    { field: "department", header: "Department", values: lists.departments },
    { field: "status", header: "Status", values: lists.statuses },
    { field: "priority", header: "Priority", values: Object.values(PRIORITY_LABELS) },
  ];

  const lastRow = TEMPLATE_ROWS + 1;
  listColumns.forEach((list, index) => {
    const columnLetter = String.fromCharCode(65 + index);
    listSheet.getCell(`${columnLetter}1`).value = list.header;
    list.values.forEach((value, i) => (listSheet.getCell(`${columnLetter}${i + 2}`).value = value));
    if (list.values.length === 0) return;

    const taskColumn = tasks.getColumn(list.field).letter;
    tasks.dataValidations.add(`${taskColumn}2:${taskColumn}${lastRow}`, {
      type: "list",
      allowBlank: true,
      formulae: [`Lists!$${columnLetter}$2:$${columnLetter}$${list.values.length + 1}`],
      // "warning" lets people type a value that isn't in the list; the importer flags it instead.
      errorStyle: "warning",
      showErrorMessage: true,
      errorTitle: "Not in the list",
      error: "This value doesn't match anything in your organization. The importer will flag it for you to fix.",
    });
  });

  const dueColumn = tasks.getColumn("dueDate");
  dueColumn.numFmt = "yyyy-mm-dd";
  tasks.dataValidations.add(`${dueColumn.letter}2:${dueColumn.letter}${lastRow}`, {
    type: "date",
    operator: "greaterThan",
    allowBlank: true,
    formulae: [new Date(Date.UTC(2000, 0, 1))],
    errorStyle: "warning",
    showErrorMessage: true,
    errorTitle: "Not a date",
    error: "Enter a date such as 2026-10-31.",
  });

  const hoursColumn = tasks.getColumn("estimatedHours").letter;
  tasks.dataValidations.add(`${hoursColumn}2:${hoursColumn}${lastRow}`, {
    type: "decimal",
    operator: "between",
    allowBlank: true,
    formulae: [0, MAX_HOURS],
    errorStyle: "warning",
    showErrorMessage: true,
    errorTitle: "Not a number",
    error: `Enter a number of hours from 0 to ${MAX_HOURS}.`,
  });

  const help = workbook.addWorksheet("Instructions");
  help.columns = [
    { header: "Column", key: "column", width: 20 },
    { header: "Required", key: "required", width: 10 },
    { header: "What to enter", key: "help", width: 90 },
  ];
  styleHeaderRow(help);
  help.addRows([
    { column: "Title", required: "Yes", help: `The task title (up to ${MAX_TITLE} characters).` },
    { column: "Description", required: "No", help: "Longer details about the task." },
    { column: "Assignee Email", required: "No", help: "Email of an existing user in your organization. Leave blank for an unassigned task." },
    { column: "Center", required: "No", help: "Center name or code. If blank, the assignee's center is used." },
    { column: "Department", required: "No", help: "Department name." },
    { column: "Status", required: "No", help: "One of your organization's task statuses. If blank, the default status is used." },
    { column: "Priority", required: "No", help: "Low, Medium, High or Urgent. If blank, Medium is used." },
    { column: "Due Date", required: "No", help: "A date in YYYY-MM-DD format, e.g. 2026-10-31." },
    { column: "Estimated Hours", required: "No", help: "A number of hours, e.g. 4 or 2.5." },
    { column: "Tags", required: "No", help: "Comma-separated labels, e.g. onboarding, q4." },
    { column: "", required: "", help: "" },
    { column: "Tip", required: "", help: `Fill in the "Tasks" sheet only. The dropdowns list your organization's current users, centers, departments and statuses. Up to ${MAX_IMPORT_ROWS} rows per upload.` },
  ]);

  return toBuffer(workbook);
}

export interface ExportTaskRow {
  id: string;
  title: string;
  description: string | null;
  assigneeEmail: string | null;
  assigneeName: string | null;
  center: string | null;
  department: string | null;
  status: string;
  priority: TaskPriority;
  dueDate: Date | null;
  estimatedHours: number | null;
  tags: string[];
  parentTask: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
}

/** Leads with the import columns in the same order and headers, so an export can be edited and re-imported. */
export async function buildExportWorkbook(tasks: ExportTaskRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Workforce Management";
  const sheet = workbook.addWorksheet("Tasks");

  sheet.columns = [
    ...COLUMNS.map((c) => ({ header: c.header.replace(" *", ""), key: c.field, width: c.width })),
    { header: "Assignee Name", key: "assigneeName", width: 24 },
    { header: "Parent Task", key: "parentTask", width: 30 },
    { header: "Created By", key: "createdBy", width: 22 },
    { header: "Created At (UTC)", key: "createdAt", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Completed At (UTC)", key: "completedAt", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: "Task ID", key: "id", width: 28 },
  ];
  sheet.getColumn("dueDate").numFmt = "yyyy-mm-dd";

  for (const task of tasks) {
    sheet.addRow({
      title: task.title,
      description: task.description ?? "",
      assigneeEmail: task.assigneeEmail ?? "",
      center: task.center ?? "",
      department: task.department ?? "",
      status: task.status,
      priority: PRIORITY_LABELS[task.priority],
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours,
      tags: task.tags.join(", "),
      assigneeName: task.assigneeName ?? "",
      parentTask: task.parentTask ?? "",
      createdBy: task.createdBy,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      id: task.id,
    });
  }

  styleHeaderRow(sheet);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  return toBuffer(workbook);
}
