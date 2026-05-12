import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiUpload } from "../api/client";

type Template = { id: string; name: string; mapping: Record<string, string> };
type FieldDef = { field_key: string; label: string };

export default function ImportCsv() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [headerRowNumber, setHeaderRowNumber] = useState<number | null>(null);

  async function refreshTemplates() {
    const d = await apiFetch<{ templates: Template[] }>("/api/import/templates");
    setTemplates(d.templates);
  }

  useEffect(() => {
    void refreshTemplates().catch(() => {});
    void apiFetch<{ fields: FieldDef[] }>("/api/fields").then((d) => setFieldDefs(d.fields));
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
      }>("/api/import/preview", fd);
      setHeaders(data.headers);
      setHeaderRowNumber(data.header_row_number ?? 1);
      const init: Record<string, string> = {};
      data.headers.forEach((h) => {
        const lower = h.toLowerCase();
        const compact = lower.replace(/[\s._-]+/g, "");
        const looksPhone =
          lower.includes("phone") ||
          lower.includes("mobile") ||
          /\bm\.?\s*o\.?\s*n\b/.test(lower) ||
          compact.includes("mono") ||
          compact.startsWith("mono");
        if (looksPhone) init[h] = "phone";
        else if (/\bname\b/i.test(h)) init[h] = "name";
        else init[h] = "";
      });
      setMapping(init);
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
      const data = await apiUpload<{ imported: number; skipped: number; total: number }>(
        "/api/import",
        fd
      );
      setResult(`Imported ${data.imported}, skipped ${data.skipped}, rows ${data.total}.`);
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
      await refreshTemplates();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save template failed");
    }
  }

  function applyTemplate(t: Template) {
    setMapping(t.mapping);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Import CSV</h1>
      <p className="text-slate-600 text-sm mt-1">
        Upload a file, map columns to fields, then import. Phone column is required for each row. Title rows or notes
        above the table are skipped automatically—the header row is detected (NAME, DATE, MO.NO, etc.).
      </p>

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
            Preview columns
          </button>
        </div>

        {templates.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-800">Saved templates</div>
            <div className="flex flex-wrap gap-2 mt-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {headers.length > 0 && (
          <form onSubmit={runImport} className="space-y-4">
            {headerRowNumber != null && (
              <p className="text-sm text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                Detected column header row: <strong>row {headerRowNumber}</strong> (skips titles or blank lines above).
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
                          <option value="">— ignore —</option>
                          <option value="name">Name</option>
                          <option value="phone">Phone</option>
                          <option value="tags">Tags</option>
                          {fieldDefs.map((f) => (
                            <option key={f.field_key} value={`custom:${f.field_key}`}>
                              Custom: {f.label}
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
                Import rows
              </button>
              <input
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void saveTemplate()}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Save mapping template
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
