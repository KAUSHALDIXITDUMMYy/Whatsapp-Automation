import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

type Field = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
};

export default function FieldsPage() {
  const [fields, setFields] = useState<Field[]>([]);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [ftype, setFtype] = useState<"date" | "text" | "number">("text");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const d = await apiFetch<{ fields: Field[] }>("/api/fields");
    setFields(d.fields);
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await apiFetch("/api/fields", {
        method: "POST",
        body: JSON.stringify({
          field_key: key.trim().toLowerCase().replace(/\s+/g, "_"),
          label,
          field_type: ftype,
        }),
      });
      setLabel("");
      setKey("");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this field definition? Customer JSON values stay stored.")) return;
    await apiFetch(`/api/fields/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Custom fields</h1>
      <p className="text-slate-600 text-sm mt-1">
        Define keys used inside customer <code className="bg-slate-100 px-1 rounded">custom_fields</code> JSON.
      </p>

      <form onSubmit={add} className="mt-6 max-w-lg space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Add field</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Label</label>
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Recharge date"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Key (slug)</label>
            <input
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="recharge_date"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Type</label>
          <select
            value={ftype}
            onChange={(e) => setFtype(e.target.value as typeof ftype)}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
          </select>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
          Save field
        </button>
      </form>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{f.label}</td>
                <td className="px-4 py-3 font-mono text-xs">{f.field_key}</td>
                <td className="px-4 py-3">{f.field_type}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" className="text-red-600 text-xs hover:underline" onClick={() => void remove(f.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
