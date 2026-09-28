import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { useAuth } from "@/context/AuthContext";
import { ImportField, ImportOptions, ImportRow, ImportRowResult, ImportValidation } from "@/types";
import ImportGrid, { FIELD_LABELS, buildGridLookups, cellId } from "@/components/import/ImportGrid";
import { IconDownload, IconUpload } from "@/components/icons";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";

type Step = "upload" | "review" | "done";

const VALIDATE_DEBOUNCE_MS = 350;

function indexResults(results: ImportRowResult[]): Record<number, ImportRowResult> {
  return Object.fromEntries(results.map((r) => [r.rowNumber, r]));
}

export default function TaskImportPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<Record<number, ImportRowResult>>({});
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Refs let the debounced validator read the latest rows and discard responses made stale by newer edits.
  const rowsRef = useRef<ImportRow[]>([]);
  const dirty = useRef(new Set<number>());
  const versions = useRef(new Map<number, number>());
  const inFlight = useRef(0);
  const timer = useRef<number>();

  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";

  const { data: options } = useQuery({
    queryKey: ["task-import-options"],
    queryFn: async () => (await api.get<ImportOptions>("/tasks/import/options")).data,
    enabled: isAdmin,
  });
  const lookups = useMemo(() => (options ? buildGridLookups(options) : null), [options]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const syncPending = () => setPendingCount(dirty.current.size + inFlight.current);

  const flushValidation = useCallback(async () => {
    const rowNumbers = [...dirty.current];
    dirty.current.clear();
    if (rowNumbers.length === 0) return syncPending();

    const sentVersions = new Map(rowNumbers.map((n) => [n, versions.current.get(n) ?? 0]));
    const payload = rowsRef.current.filter((r) => sentVersions.has(r.rowNumber));
    if (payload.length === 0) return syncPending();

    inFlight.current += 1;
    syncPending();
    try {
      const { data } = await api.post<ImportValidation>("/tasks/import/validate", { rows: payload });
      setResults((prev) => {
        const next = { ...prev };
        for (const result of data.rows) {
          // Skip results for rows edited again since this request was sent.
          if (versions.current.get(result.rowNumber) === sentVersions.get(result.rowNumber)) next[result.rowNumber] = result;
        }
        return next;
      });
    } catch {
      // Put the rows back so the next edit retries them.
      rowNumbers.forEach((n) => dirty.current.add(n));
      setError("Couldn't re-check your changes. Keep editing to retry.");
    } finally {
      inFlight.current -= 1;
      syncPending();
    }
  }, []);

  const handleChange = useCallback(
    (rowNumber: number, field: ImportField, value: string) => {
      const next = rowsRef.current.map((r) => (r.rowNumber === rowNumber ? { ...r, [field]: value } : r));
      rowsRef.current = next;
      setRows(next);
      versions.current.set(rowNumber, (versions.current.get(rowNumber) ?? 0) + 1);
      dirty.current.add(rowNumber);
      syncPending();
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flushValidation, VALIDATE_DEBOUNCE_MS);
    },
    [flushValidation]
  );

  const handleRemove = useCallback((rowNumber: number) => {
    const next = rowsRef.current.filter((r) => r.rowNumber !== rowNumber);
    rowsRef.current = next;
    setRows(next);
    dirty.current.delete(rowNumber);
    versions.current.set(rowNumber, (versions.current.get(rowNumber) ?? 0) + 1);
    setResults((prev) => {
      const { [rowNumber]: _removed, ...rest } = prev;
      return rest;
    });
    syncPending();
  }, []);

  function loadRows(nextRows: ImportRow[], validation: ImportValidation) {
    rowsRef.current = nextRows;
    dirty.current.clear();
    versions.current.clear();
    setRows(nextRows);
    setResults(indexResults(validation.rows));
    setOnlyIssues(false);
    syncPending();
  }

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Please choose an .xlsx file (Excel 2007 or later).");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post<{ rows: ImportRow[]; validation: ImportValidation }>("/tasks/import/preview", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      loadRows(data.rows, data.validation);
      setFileName(file.name);
      setStep("review");
    } catch (err: any) {
      setError(
        err?.response?.status === 413
          ? "That file is too large — the limit is 2 MB."
          : err?.response?.data?.message ?? "Couldn't read that file."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    setError(null);
    setCommitting(true);
    try {
      const { data } = await api.post<{ created: number }>("/tasks/import/commit", { rows: rowsRef.current });
      setCreatedCount(data.created);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (err: any) {
      const body = err?.response?.data;
      if (body?.validation) setResults(indexResults(body.validation.rows));
      setError(body?.message ?? "Import failed — nothing was created. Please try again.");
    } finally {
      setCommitting(false);
    }
  }

  async function downloadTemplate() {
    setError(null);
    try {
      await downloadFromApi("/tasks/import/template", "task-import-template.xlsx");
    } catch (err: any) {
      setError(err.message);
    }
  }

  function startOver() {
    loadRows([], { rows: [], summary: { total: 0, errorRows: 0, warningRows: 0 } });
    setError(null);
    setFileName("");
    setStep("upload");
  }

  const summary = useMemo(() => {
    let errorRows = 0;
    let warningRows = 0;
    for (const row of rows) {
      const issues = results[row.rowNumber]?.issues ?? [];
      if (issues.some((i) => i.severity === "error")) errorRows += 1;
      else if (issues.length > 0) warningRows += 1;
    }
    return { total: rows.length, errorRows, warningRows, ready: rows.length - errorRows - warningRows };
  }, [rows, results]);

  const visibleRows = useMemo(
    () => (onlyIssues ? rows.filter((r) => (results[r.rowNumber]?.issues.length ?? 0) > 0) : rows),
    [rows, results, onlyIssues]
  );

  const issueList = useMemo(
    () => rows.flatMap((row) => (results[row.rowNumber]?.issues ?? []).map((issue) => ({ rowNumber: row.rowNumber, issue }))),
    [rows, results]
  );

  if (!isAdmin) return <Navigate to="/tasks" replace />;

  function focusCell(rowNumber: number, field: ImportField) {
    const el = document.getElementById(cellId(rowNumber, field));
    el?.scrollIntoView({ block: "center", inline: "center" });
    el?.focus();
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const validating = pendingCount > 0;
  const canImport = step === "review" && rows.length > 0 && summary.errorRows === 0 && !validating && !committing;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/tasks" className="text-xs text-brand-600 hover:underline">
            ← Back to tasks
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 mt-1">Import tasks from Excel</h1>
        </div>
        <button onClick={downloadTemplate} className={btnSecondary}>
          <IconDownload className="w-4 h-4" /> Download template
        </button>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {step === "upload" && (
        <div className={`${card} p-6 space-y-5`}>
          <ol className="grid gap-3 sm:grid-cols-3 text-sm text-gray-600">
            <li>
              <span className="font-semibold text-gray-800">1. Download the template.</span> Its dropdowns list your current
              users, centers, departments and statuses.
            </li>
            <li>
              <span className="font-semibold text-gray-800">2. Fill in one task per row.</span> Assign people by their email —
              only Title is required.
            </li>
            <li>
              <span className="font-semibold text-gray-800">3. Upload it here.</span> You'll review every row and fix any problems
              before anything is created.
            </li>
          </ol>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={clsx(
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-colors",
              dragging ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
            )}
          >
            <IconUpload className="w-8 h-8 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {uploading ? "Reading and checking your file…" : "Drop your .xlsx file here, or click to choose"}
            </span>
            <span className="text-xs text-gray-400">Up to 1,000 rows · 2 MB max</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      )}

      {step === "review" && lookups && (
        <>
          <div className={`${card} px-4 py-3 flex items-center justify-between flex-wrap gap-3`}>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium text-gray-800 truncate max-w-[240px]" title={fileName}>
                {fileName}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-600">{summary.total} rows</span>
              {summary.errorRows > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                  {summary.errorRows} must be fixed
                </span>
              )}
              {summary.warningRows > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                  {summary.warningRows} will use defaults
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">{summary.ready} ready</span>
              {validating && <span className="text-xs text-gray-400">Checking…</span>}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-gray-600">
                <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
                Only rows with issues
              </label>
              <button onClick={startOver} className={btnSecondary} disabled={committing}>
                Upload a different file
              </button>
              <button onClick={handleCommit} disabled={!canImport} className={btnPrimary}>
                {committing ? "Importing…" : `Import ${summary.total} task${summary.total === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> Must be fixed before importing
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" /> A default will be used unless
              you pick a value
            </span>
            <span>Hover a highlighted cell to see the problem.</span>
            {summary.errorRows > 0 && (
              <span className="text-red-600 font-medium">Fix or remove the red rows to enable import.</span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className={`${card} p-8 text-center text-sm text-gray-500`}>
              All rows were removed.{" "}
              <button onClick={startOver} className="text-brand-600 hover:underline">
                Upload a file
              </button>
            </div>
          ) : (
            <ImportGrid rows={visibleRows} results={results} lookups={lookups} onChange={handleChange} onRemove={handleRemove} />
          )}

          {issueList.length > 0 && (
            <div className={`${card} p-4`}>
              <div className="text-sm font-medium text-gray-700 mb-2">
                Issues <span className="text-gray-400 font-normal">({issueList.length})</span>
              </div>
              <ul className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                {issueList.map(({ rowNumber, issue }, i) => (
                  <li key={`${rowNumber}-${issue.field}-${i}`}>
                    <button
                      type="button"
                      onClick={() => focusCell(rowNumber, issue.field)}
                      className="w-full flex items-start gap-2 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span
                        className={clsx(
                          "mt-1.5 w-2 h-2 rounded-full shrink-0",
                          issue.severity === "error" ? "bg-red-500" : "bg-amber-500"
                        )}
                      />
                      <span className="text-gray-500 shrink-0 w-44">
                        Row {rowNumber} · {FIELD_LABELS[issue.field]}
                      </span>
                      <span className="text-gray-700">{issue.message}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {step === "review" && !lookups && <div className="text-sm text-gray-400">Loading your organization's data…</div>}

      {step === "done" && (
        <div className={`${card} p-8 text-center space-y-4`}>
          <div className="text-lg font-semibold text-gray-900">
            Imported {createdCount} task{createdCount === 1 ? "" : "s"}
          </div>
          <p className="text-sm text-gray-500">Assignees have been notified, and each task's history records that it came from a bulk import.</p>
          <div className="flex justify-center gap-2">
            <Link to="/tasks" className={btnPrimary}>
              View tasks
            </Link>
            <button onClick={startOver} className={btnSecondary}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
