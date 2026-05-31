import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { inputBase, labelBase } from "./shared";

type Summary = {
  vendor: {
    id: string;
    company_name: string;
    email: string;
    created_at: string;
    subscription_tier: string;
    subscription_expires_at: string | null;
    whatsapp_sender: string | null;
    customer_count: number;
    messages_sent: number;
    messages_failed: number;
    scheduled_visits: number;
  };
};

export default function AdminVendorDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sendOk, setSendOk] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await apiFetch<Summary>(`/api/admin/vendors/${id}/summary`, { admin: true });
        if (!cancelled) setData(s);
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function sendReminder(e: FormEvent) {
    e.preventDefault();
    if (!id || !message.trim()) return;
    setErr(null);
    setSendOk(null);
    try {
      await apiFetch(`/api/admin/vendors/${id}/dashboard-reminders`, {
        method: "POST",
        admin: true,
        body: JSON.stringify({ message: message.trim() }),
      });
      setSendOk("Reminder sent — they will see it on their dashboard until dismissed.");
      setMessage("");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    }
  }

  async function setVendorPassword(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setErr(null);
    setPwErr(null);
    setPwMsg(null);
    if (newPassword.length < 8) {
      setPwErr("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr("Passwords do not match.");
      return;
    }
    try {
      await apiFetch(`/api/admin/vendors/${id}/password`, {
        method: "POST",
        admin: true,
        body: JSON.stringify({ password: newPassword }),
      });
      setPwMsg("Password updated. Share the new password with the vendor securely (e.g. phone).");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      setPwErr(e instanceof Error ? e.message : "Failed to update password");
    }
  }

  const v = data?.vendor;

  return (
    <div>
      <div className="border-b border-slate-100 pb-6">
        <Link to="/admin/vendors" className="text-sm font-medium text-brand-700 hover:underline">
          ← Vendors
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{v?.company_name ?? "…"}</h1>
        <p className="mt-1 text-sm text-slate-600">{v?.email}</p>
      </div>

      {err && (
        <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200/80">
          {err}
        </div>
      )}

      {!v && !err && <p className="mt-8 text-slate-600">Loading…</p>}

      {v && (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Customers</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v.customer_count}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Messages sent</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v.messages_sent}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Failed</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v.messages_failed}</p>
            </div>
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Scheduled visits</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{v.scheduled_visits}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>
              <strong className="text-slate-800">Tier:</strong>{" "}
              <span className="capitalize text-slate-900">{v.subscription_tier}</span>
            </span>
            <span>
              <strong className="text-slate-800">Subscription ends:</strong>{" "}
              {v.subscription_expires_at
                ? new Date(v.subscription_expires_at).toLocaleString()
                : "—"}
            </span>
            <span>
              <strong className="text-slate-800">Pro sender:</strong> {v.whatsapp_sender ?? "—"}
            </span>
          </div>

          <section className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-lg font-semibold text-slate-900">Login password</h2>
            <p className="mt-1 text-sm text-slate-600">
              If the vendor forgot their password, set a new one here. They’ll use it on the vendor login page. Minimum 8
              characters.
            </p>
            <form onSubmit={setVendorPassword} className="mt-4 grid gap-3 sm:max-w-md">
              <div>
                <label className={labelBase}>New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${inputBase} mt-2`}
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className={labelBase}>Confirm password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputBase} mt-2`}
                  minLength={8}
                  required
                />
              </div>
              {pwErr && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-100">{pwErr}</p>
              )}
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Update password
              </button>
            </form>
            {pwMsg && (
              <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200/80">
                {pwMsg}
              </p>
            )}
          </section>

          <section className="mt-10 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-slate-900">Dashboard reminder</h2>
            <p className="mt-1 text-sm text-slate-600">
              They will see this alert at the top of their vendor dashboard until they dismiss it.
            </p>
            <form onSubmit={sendReminder} className="mt-4 space-y-3">
              <div>
                <label className={labelBase}>Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="e.g. Your plan expires in 7 days — renew to keep Pro features."
                  className={`${inputBase} mt-2 resize-y`}
                  required
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Send reminder
              </button>
            </form>
            {sendOk && (
              <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200/80">
                {sendOk}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
