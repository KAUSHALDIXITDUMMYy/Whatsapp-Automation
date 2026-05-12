import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Customer = {
  id: string;
  name: string;
  phone: string;
  tags: string[];
  custom_fields: Record<string, string>;
};

export default function Customers() {
  const [items, setItems] = useState<Customer[]>([]);
  const [tag, setTag] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (tag.trim()) qs.set("tag", tag.trim());
      if (search.trim()) qs.set("search", search.trim());
      const data = await apiFetch<{ customers: Customer[] }>(`/api/customers?${qs.toString()}`);
      setItems(data.customers);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-600 text-sm mt-1">Filter by tag or search name / phone.</p>
        </div>
        <Link
          to="/customers/new"
          className="inline-flex justify-center rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700"
        >
          Add customer
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600">Tag</label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="e.g. VIP"
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or phone"
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm w-52"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm hover:bg-slate-900"
        >
          Apply
        </button>
      </div>

      {err && <p className="text-red-600 text-sm mt-4">{err}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Custom fields</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-brand-50 text-brand-800 px-2 py-0.5 text-xs">
                        {t}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                  {JSON.stringify(c.custom_fields ?? {})}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/customers/${c.id}`} className="text-brand-700 hover:underline font-medium">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
