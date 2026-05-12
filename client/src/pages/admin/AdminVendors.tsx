import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { inputBase, labelBase } from "./shared";

export type VendorRow = {
  id: string;
  company_name: string;
  email: string;
  created_at: string;
  subscription_tier: string;
  subscription_expires_at: string | null;
  whatsapp_sender: string | null;
  customer_count: number;
  messages_sent: number;
};

export default function AdminVendors() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState("");
  const [editTier, setEditTier] = useState<"basic" | "pro">("basic");
  const [editExpiry, setEditExpiry] = useState("");
  const [editSender, setEditSender] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  async function load() {
    const v = await apiFetch<{ vendors: VendorRow[] }>("/api/admin/vendors", { admin: true });
    setVendors(v.vendors);
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function saveVendor(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaveMsg(null);
    if (!editId.trim()) {
      setErr("Select a vendor.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        subscription_tier: editTier,
      };
      if (editExpiry.trim()) {
        payload.subscription_expires_at = new Date(editExpiry).toISOString();
      } else {
        payload.subscription_expires_at = null;
      }
      payload.whatsapp_sender = editSender.trim() || null;

      await apiFetch(`/api/admin/vendors/${editId.trim()}`, {
        method: "PATCH",
        admin: true,
        body: JSON.stringify(payload),
      });
      setSaveMsg("Vendor updated.");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  return (
    <div>
      <header className="border-b border-slate-100 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Accounts</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Vendors</h1>
        <p className="mt-1 text-sm text-slate-600">Update plans after payment; drill into a vendor for dashboard stats and reminders.</p>
      </header>

      <section className="mt-8 rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm md:p-8">
        <h2 className="text-lg font-semibold text-slate-900">Update vendor plan</h2>
        <form onSubmit={saveVendor} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
          <div className="sm:col-span-2 lg:col-span-4">
            <label className={labelBase}>Vendor</label>
            <select
              value={editId}
              onChange={(e) => {
                setEditId(e.target.value);
                const row = vendors.find((x) => x.id === e.target.value);
                if (row) {
                  setEditTier(row.subscription_tier === "pro" ? "pro" : "basic");
                  setEditSender(row.whatsapp_sender ?? "");
                  setEditExpiry(row.subscription_expires_at ? row.subscription_expires_at.slice(0, 16) : "");
                }
              }}
              className={`${inputBase} mt-2 font-mono text-xs`}
            >
              <option value="">Select vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.company_name} ({v.email.slice(0, 24)}…)
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className={labelBase}>Tier</label>
            <select
              value={editTier}
              onChange={(e) => setEditTier(e.target.value as "basic" | "pro")}
              className={`${inputBase} mt-2`}
            >
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div className="lg:col-span-3">
            <label className={labelBase}>Expires (local)</label>
            <input
              type="datetime-local"
              value={editExpiry}
              onChange={(e) => setEditExpiry(e.target.value)}
              className={`${inputBase} mt-2`}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelBase}>Pro WhatsApp sender</label>
            <input
              value={editSender}
              onChange={(e) => setEditSender(e.target.value)}
              placeholder="+15551234567"
              className={`${inputBase} mt-2 font-mono`}
            />
          </div>
          <div className="lg:col-span-12">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Save changes
            </button>
          </div>
        </form>
        {saveMsg && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200/80">
            {saveMsg}
          </p>
        )}
      </section>

      {err && (
        <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200/80">
          {err}
        </div>
      )}

      <section className="mt-10 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-900">Directory</h2>
          <p className="mt-1 text-sm text-slate-600">Click a vendor for metrics and dashboard reminders</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead>
              <tr className="bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="whitespace-nowrap px-6 py-3">Business</th>
                <th className="whitespace-nowrap px-6 py-3">Tier</th>
                <th className="whitespace-nowrap px-6 py-3">Expires</th>
                <th className="whitespace-nowrap px-6 py-3">Email</th>
                <th className="whitespace-nowrap px-6 py-3">Customers</th>
                <th className="whitespace-nowrap px-6 py-3">Msgs sent</th>
                <th className="whitespace-nowrap px-6 py-3">Joined</th>
                <th className="whitespace-nowrap px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((v) => (
                <tr key={v.id} className="transition hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-900">{v.company_name}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ${
                        v.subscription_tier === "pro"
                          ? "bg-violet-50 text-violet-800 ring-violet-200/80"
                          : "bg-slate-100 text-slate-700 ring-slate-200/80"
                      }`}
                    >
                      {v.subscription_tier}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                    {v.subscription_expires_at ? new Date(v.subscription_expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="max-w-[200px] truncate px-6 py-4 text-slate-700" title={v.email}>
                    {v.email}
                  </td>
                  <td className="px-6 py-4 tabular-nums text-slate-900">{v.customer_count}</td>
                  <td className="px-6 py-4 tabular-nums text-slate-900">{v.messages_sent}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                    {new Date(v.created_at).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <Link
                      to={`/admin/vendors/${v.id}`}
                      className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
