import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Customer = {
  id: string;
  name: string;
  phone: string;
  joining_date: string | null;
  recharge_date: string | null;
  rent_current_period_paid?: boolean;
  tags: string[];
};

export default function Customers() {
  const [items, setItems] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const qs = new URLSearchParams();
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

  async function markPaid(id: string) {
    try {
      await apiFetch(`/api/customers/${id}/mark-rent-paid`, { method: "POST" });
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to mark paid");
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subscribers</h1>
          <p className="text-slate-600 text-sm mt-1">Due dates from joining date. Mark rent received to pause reminders.</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/import"
            className="inline-flex justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            Import sheet
          </Link>
          <Link
            to="/customers/new"
            className="inline-flex justify-center rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium"
          >
            Add subscriber
          </Link>
        </div>
      </div>

      <div className="mt-6 flex gap-3 items-end">
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
          className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm"
        >
          Apply
        </button>
      </div>

      {err && <p className="text-red-600 text-sm mt-4">{err}</p>}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Joining</th>
              <th className="px-4 py-3">Next due</th>
              <th className="px-4 py-3">Rent</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{c.phone}</td>
                <td className="px-4 py-3">{c.joining_date?.slice(0, 10) ?? "—"}</td>
                <td className="px-4 py-3">{c.recharge_date?.slice(0, 10) ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.rent_current_period_paid ? (
                    <span className="text-green-700 text-xs font-medium">Paid</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markPaid(c.id)}
                      className="text-xs text-brand-600 hover:underline"
                    >
                      Mark received
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/customers/${c.id}`} className="text-brand-700 hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No subscribers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
