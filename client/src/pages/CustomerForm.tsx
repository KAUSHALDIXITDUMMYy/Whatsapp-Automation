import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";

type FieldDef = { field_key: string; label: string; field_type: string };

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [tags, setTags] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    void apiFetch<{ fields: FieldDef[] }>("/api/fields").then((d) => setFields(d.fields));
  }, []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await apiFetch<{
          name: string;
          phone: string;
          tags: string[];
          custom_fields: Record<string, string>;
        }>(`/api/customers/${id}`);
        if (cancelled) return;
        setName(c.name);
        setPhone(c.phone);
        setTags((c.tags ?? []).join(", "));
        setCustom(c.custom_fields ?? {});
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const tagList = tags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const body = {
      name,
      phone,
      tags: tagList,
      custom_fields: custom,
    };
    try {
      if (isNew) {
        await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(body) });
      } else {
        await apiFetch(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      navigate("/customers");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  async function remove() {
    if (!id || isNew) return;
    if (!confirm("Delete this customer?")) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      navigate("/customers");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Delete failed");
    }
  }

  function setCustomField(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) return <p className="text-slate-600">Loading…</p>;

  return (
    <div>
      <div className="flex items-center gap-4">
        <Link to="/customers" className="text-sm text-brand-700 hover:underline">
          ← Back
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mt-4">{isNew ? "New customer" : "Edit customer"}</h1>

      <form onSubmit={onSubmit} className="mt-6 max-w-xl space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Phone (required)</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Tags (comma-separated)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="VIP, prepaid"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {fields.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-800">Custom fields</div>
            {fields.map((f) => (
              <div key={f.field_key}>
                <label className="block text-xs font-medium text-slate-600">{f.label}</label>
                <input
                  type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                  value={custom[f.field_key] ?? ""}
                  onChange={(e) => setCustomField(f.field_key, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                />
              </div>
            ))}
          </div>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-3">
          <button type="submit" className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-medium">
            Save
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={() => void remove()}
              className="rounded-lg border border-red-300 text-red-700 px-5 py-2 text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
