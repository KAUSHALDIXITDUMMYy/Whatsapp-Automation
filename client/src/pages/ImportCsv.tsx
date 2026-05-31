import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUpload } from "../api/client";

type Template = { id: string; name: string; mapping: Record<string, string> };
type SheetColumn = { key: string; label: string; required: boolean; example: string };

export default function ImportCsv() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sheetColumns, setSheetColumns] = useState<SheetColumn[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [headerRowNumber, setHeaderRowNumber] = useState<number | null>(null);

  useEffect(() => {
    void apiFetch<{ columns: SheetColumn[] }>("/api/import/sheet-format")
      .then((d) => setSheetColumns(d.columns))
      .catch(() => {});
    void apiFetch<{ templates: Template[] }>("/api/import/templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => {});
  }, []);

  async function preview() {
    if (!file) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const data = await apiUpload<{
        headers: string[];
        header_row_number?: number;
        suggested_mapping: Record<string, string>;
        sheet_format: { columns: SheetColumn[] };
      }>("/api/import/preview", fd);
      setHeaders(data.headers);
      setHeaderRowNumber(data.header_row_number ?? 1);
      setSheetColumns(data.sheet_format?.columns ?? sheetColumns);
      setMapping(data.suggested_mapping ?? {});
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    }
  }

  async function runImport(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setErr(null);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    try {
      const data = await apiUpload<{
        imported: number;
        skipped: number;
        missing_joining_date: number;
        total: number;
      }>("/api/import", fd);
      setResult(
        `Imported ${data.imported}, skipped ${data.skipped}` +
          (data.missing_joining_date
            ? `, ${data.missing_joining_date} rows missing joining date`
            : "") +
          ` (${data.total} rows). Due dates calculated from joining date + your billing cycle.`
      );
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Import failed");
    }
  }

  async function saveTemplate() {
    if (!templateName.trim()) return;
    try {
      await apiFetch("/api/import/templates", {
        method: "POST",
        body: JSON.stringify({ name: templateName.trim(), mapping }),
      });
      setTemplateName("");
      const d = await apiFetch<{ templates: Template[] }>("/api/import/templates");
      setTemplates(d.templates);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save template failed");
    }
  }

  const mapOptions = [
    { value: "", label: "— ignore —" },
    ...sheetColumns.map((c) => ({ value: c.key, label: c.label + (c.required ? " *" : "") })),
    { value: "tags", label: "Tags (optional)" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Import subscriber sheet</h1>
      <p className="text-slate-600 text-sm mt-1">
        Use the standard columns below. Recharge due date is calculated from <strong>joining date</strong> and
        your billing cycle in Settings.
      </p>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-semibold text-slate-800">Required columns</p>
        <ul className="mt-2 space-y-1 text-slate-700">
          {sheetColumns.map((c) => (
            <li key={c.key}>
              <code className="bg-white px-1 rounded border">{c.key}</code> — {c.label}
              {c.required && " *"} <span className="text-slate-500">e.g. {c.example}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 space-y-4 max-w-3xl">
        <div>
          <label className="block text-sm font-medium text-slate-700">CSV file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm"
          />
          <button
            type="button"
            onClick={() => void preview()}
            disabled={!file}
            className="mt-2 rounded-lg bg-slate-800 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Preview & auto-map
          </button>
        </div>

        {headers.length > 0 && (
          <form onSubmit={runImport} className="space-y-4">
            {headerRowNumber != null && (
              <p className="text-sm text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                Header row: <strong>{headerRowNumber}</strong>
              </p>
            )}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">CSV column</th>
                    <th className="text-left px-3 py-2">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h) => (
                    <tr key={h} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{h}</td>
                      <td className="px-3 py-2">
                        <select
                          value={mapping[h] ?? ""}
                          onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}
                          className="w-full rounded border border-slate-300 text-sm"
                        >
                          {mapOptions.map((o) => (
                            <option key={o.value || "ignore"} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3 items-end">
              <button
                type="submit"
                className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-medium"
              >
                Import subscribers
              </button>
              {templates.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) setMapping(t.mapping);
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Load saved mapping…
                  </option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <input
                placeholder="Save mapping as…"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void saveTemplate()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Save mapping
              </button>
            </div>
          </form>
        )}

        {result && <p className="text-green-700 text-sm">{result}</p>}
        {err && <p className="text-red-600 text-sm">{err}</p>}
      </div>
    </div>
  );
}
