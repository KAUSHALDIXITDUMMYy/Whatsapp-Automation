import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { inputBase, labelBase } from "./shared";
import type { VendorRow } from "./AdminVendors";

export default function AdminExpiring() {
  const [days, setDays] = useState(14);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [sentId, setSentId] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const r = await apiFetch<{ vendors: VendorRow[] }>(
      `/api/admin/vendors/expiring?days=${days}&include_expired=${includeExpired}`,
      { admin: true }
    );
    setVendors(r.vendors);
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, [days, includeExpired]);

  async function sendReminder(e: FormEvent, vendorId: string) {
    e.preventDefault();
    const text = (messages[vendorId] ?? "").trim();
    if (!text) return;
    setErr(null);
    setSentId(null);
    try {
      await apiFetch(`/api/admin/vendors/${vendorId}/dashboard-reminders`, {
        method: "POST",
        admin: true,
        body: JSON.stringify({ message: text }),
      });
      setSentId(vendorId);
      setMessages((m) => ({ ...m, [vendorId]: "" }));
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    }
  }

  return (
    <div>
      <header className="border-b border-slate-100 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Subscriptions</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Expiring soon</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vendors whose plan end date falls in the window below. Send a reminder — it appears on their dashboard.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div>
          <label className={labelBase}>Within (days)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10) || 14)}
            className={`${inputBase} mt-2 w-28`}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(e) => setIncludeExpired(e.target.checked)}
            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Include already expired
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      {err && (
        <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200/80">
          {err}
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Expires</th>
                <th className="min-w-[240px] px-4 py-3">Reminder</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((v) => {
                const exp = v.subscription_expires_at ? new Date(v.subscription_expires_at) : null;
                const expired = exp ? exp < new Date() : false;
                return (
                  <tr key={v.id} className="align-top hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-900">{v.company_name}</div>
                      <div className="text-xs text-slate-500">{v.email}</div>
                    </td>
                    <td className="px-4 py-4 capitalize text-slate-700">{v.subscription_tier}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {exp ? (
                        <span className={expired ? "font-semibold text-rose-700" : "text-slate-800"}>
                          {exp.toLocaleDateString()}
                          {expired && <span className="ml-2 text-xs">(expired)</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <form onSubmit={(e) => void sendReminder(e, v.id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <textarea
                          value={messages[v.id] ?? ""}
                          onChange={(e) => setMessages((m) => ({ ...m, [v.id]: e.target.value }))}
                          placeholder="Short note for their dashboard…"
                          rows={2}
                          className={`${inputBase} min-h-[60px] flex-1 text-xs`}
                        />
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                        >
                          Send
                        </button>
                      </form>
                      {sentId === v.id && (
                        <p className="mt-1 text-xs font-medium text-emerald-700">Sent.</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Link to={`/admin/vendors/${v.id}`} className="font-semibold text-brand-700 hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {vendors.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-slate-500">No vendors in this window.</p>
        )}
      </div>
    </div>
  );
}
