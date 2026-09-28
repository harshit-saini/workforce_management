import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  ImportLookups,
  ImportRow,
  MAX_IMPORT_ROWS,
  buildExportWorkbook,
  buildTemplateWorkbook,
  readTaskSheet,
  summarizeValidation,
  validateImportRow,
} from "../taskSheet.js";

const lookups: ImportLookups = {
  users: new Map([["eve@acme.test", { id: "u-eve", name: "Eve Malhotra", email: "eve@acme.test", centerId: "c-noida" }]]),
  centers: new Map([
    ["noida center", { id: "c-noida", name: "Noida Center" }],
    ["noi", { id: "c-noida", name: "Noida Center" }],
    ["gurgaon center", { id: "c-gur", name: "Gurgaon Center" }],
  ]),
  departments: new Map([["engineering", { id: "d-eng", name: "Engineering" }]]),
  statuses: new Map([
    ["todo", { key: "TODO", label: "To do", category: "ACTIVE" }],
    ["to do", { key: "TODO", label: "To do", category: "ACTIVE" }],
    ["done", { key: "DONE", label: "Done", category: "DONE" }],
  ]),
  defaultStatus: { key: "BACKLOG", label: "Backlog", category: "BACKLOG" },
};

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 2,
    title: "Write docs",
    description: "",
    assigneeEmail: "",
    center: "",
    department: "",
    status: "",
    priority: "",
    dueDate: "",
    estimatedHours: "",
    tags: "",
    ...overrides,
  };
}

const fieldsWithIssues = (r: ReturnType<typeof validateImportRow>) => r.issues.map((i) => `${i.field}:${i.severity}`);

describe("validateImportRow", () => {
  it("resolves valid values case-insensitively and normalizes them", () => {
    const result = validateImportRow(
      row({
        assigneeEmail: " EVE@Acme.Test ",
        center: "noi",
        department: "ENGINEERING",
        status: "to do",
        priority: "high",
        dueDate: "2026-10-31",
        estimatedHours: "2.5",
        tags: "docs, q4, Docs",
      }),
      lookups
    );

    expect(result.issues).toEqual([]);
    expect(result.assigneeName).toBe("Eve Malhotra");
    expect(result.normalized).toMatchObject({
      assigneeEmail: "eve@acme.test",
      center: "Noida Center",
      department: "Engineering",
      status: "TODO",
      priority: "HIGH",
    });
    expect(result.task).toMatchObject({
      assigneeId: "u-eve",
      centerId: "c-noida",
      departmentId: "d-eng",
      statusKey: "TODO",
      priority: "HIGH",
      estimatedHours: 2.5,
      tags: ["docs", "q4"],
    });
    expect(result.task?.dueDate?.toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });

  it("blocks the row when the title is missing", () => {
    const result = validateImportRow(row({ title: "  " }), lookups);
    expect(fieldsWithIssues(result)).toEqual(["title:error"]);
    expect(result.task).toBeNull();
  });

  it("flags an unknown assignee as a warning and falls back to unassigned", () => {
    const result = validateImportRow(row({ assigneeEmail: "ghost@acme.test" }), lookups);
    expect(fieldsWithIssues(result)).toEqual(["assigneeEmail:warning"]);
    expect(result.assigneeName).toBeNull();
    expect(result.task?.assigneeId).toBeNull();
  });

  it("falls back to the assignee's center when the center is unknown", () => {
    const result = validateImportRow(row({ assigneeEmail: "eve@acme.test", center: "Mars Base" }), lookups);
    expect(fieldsWithIssues(result)).toEqual(["center:warning"]);
    expect(result.task?.centerId).toBe("c-noida");
  });

  it("uses defaults for unknown status and priority", () => {
    const result = validateImportRow(row({ status: "Someday", priority: "critical" }), lookups);
    expect(fieldsWithIssues(result)).toEqual(["status:warning", "priority:warning"]);
    expect(result.task).toMatchObject({ statusKey: "BACKLOG", priority: "MEDIUM" });
  });

  it("rejects ambiguous or impossible dates instead of guessing", () => {
    for (const dueDate of ["31/10/2026", "2026-02-30", "next week"]) {
      const result = validateImportRow(row({ dueDate }), lookups);
      expect(fieldsWithIssues(result)).toEqual(["dueDate:warning"]);
      expect(result.task?.dueDate).toBeNull();
    }
  });

  it("drops invalid estimated hours", () => {
    for (const estimatedHours of ["-1", "two", "20000"]) {
      const result = validateImportRow(row({ estimatedHours }), lookups);
      expect(fieldsWithIssues(result)).toEqual(["estimatedHours:warning"]);
      expect(result.task?.estimatedHours).toBeNull();
    }
  });

  it("summarizes blocking and fallback rows separately", () => {
    const summary = summarizeValidation([
      validateImportRow(row({ rowNumber: 2 }), lookups),
      validateImportRow(row({ rowNumber: 3, title: "" }), lookups),
      validateImportRow(row({ rowNumber: 4, priority: "nope" }), lookups),
    ]);
    expect(summary).toEqual({ total: 3, errorRows: 1, warningRows: 1 });
  });
});

async function workbookBuffer(build: (sheet: ExcelJS.Worksheet) => void, sheetName = "Tasks"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook.addWorksheet(sheetName));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("readTaskSheet", () => {
  it("maps columns by header regardless of order, and flattens Excel cell types", async () => {
    const buffer = await workbookBuffer((sheet) => {
      sheet.addRow(["Due Date", "Unrelated column", "Assignee", "Title *", "Estimated Hours"]);
      sheet.addRow([
        new Date(Date.UTC(2026, 9, 31)),
        "ignored",
        { text: "eve@acme.test", hyperlink: "mailto:eve@acme.test" },
        { richText: [{ text: "Write " }, { text: "docs" }] },
        { formula: "2+2", result: 4 },
      ]);
      sheet.addRow([]); // blank rows are skipped
      sheet.addRow([46326, "", "", "Second task", ""]); // unformatted Excel date serial
    });

    const rows = await readTaskSheet(buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      title: "Write docs",
      assigneeEmail: "eve@acme.test",
      dueDate: "2026-10-31",
      estimatedHours: "4",
    });
    expect(rows[1]).toMatchObject({ rowNumber: 4, title: "Second task", dueDate: "2026-10-31" });
  });

  it("requires a Title column", async () => {
    const buffer = await workbookBuffer((sheet) => sheet.addRow(["Name", "Email"]));
    await expect(readTaskSheet(buffer)).rejects.toThrow(/Title/);
  });

  it("rejects files that aren't xlsx", async () => {
    await expect(readTaskSheet(Buffer.from("title,assignee\nhello,eve"))).rejects.toThrow(/xlsx/);
  });

  it(`rejects more than ${MAX_IMPORT_ROWS} rows`, async () => {
    const buffer = await workbookBuffer((sheet) => {
      sheet.addRow(["Title"]);
      for (let i = 0; i <= MAX_IMPORT_ROWS; i++) sheet.addRow([`Task ${i}`]);
    });
    await expect(readTaskSheet(buffer)).rejects.toThrow(/more than/);
  });
});

describe("template and export workbooks", () => {
  it("produces a template the importer reads as empty", async () => {
    const buffer = await buildTemplateWorkbook({
      emails: ["eve@acme.test"],
      centers: ["Noida Center"],
      departments: [],
      statuses: ["Backlog", "To do"],
    });
    expect(await readTaskSheet(buffer)).toEqual([]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Tasks", "Lists", "Instructions"]);
    expect(workbook.getWorksheet("Lists")?.state).toBe("hidden");
  });

  it("exports in a format that can be re-imported", async () => {
    const buffer = await buildExportWorkbook([
      {
        id: "t1",
        title: "Write docs",
        description: "Details",
        assigneeEmail: "eve@acme.test",
        assigneeName: "Eve Malhotra",
        center: "Noida Center",
        department: "Engineering",
        status: "To do",
        priority: "HIGH",
        dueDate: new Date(Date.UTC(2026, 9, 31)),
        estimatedHours: 3,
        tags: ["docs", "q4"],
        parentTask: null,
        createdBy: "Alice Sharma",
        createdAt: new Date(),
        completedAt: null,
      },
    ]);

    const [reimported] = await readTaskSheet(buffer);
    const result = validateImportRow(reimported, lookups);
    expect(result.issues).toEqual([]);
    expect(result.task).toMatchObject({
      title: "Write docs",
      assigneeId: "u-eve",
      centerId: "c-noida",
      statusKey: "TODO",
      priority: "HIGH",
      estimatedHours: 3,
      tags: ["docs", "q4"],
    });
  });
});
