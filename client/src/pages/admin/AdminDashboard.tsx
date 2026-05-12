import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { IconAlert, IconClock, IconSend, IconTemplate, IconUsers } from "./shared";

export default function AdminDashboard() {
  const [stats, setStats] = useState<{ vendors: number; messages_sent: number; messages_failed: number } | null>(
    null
  );
  const [expiringSoon, setExpiringSoon] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, ex] = await Promise.all([
          apiFetch<{ vendors: number; messages_sent: number; messages_failed: number }>("/api/admin/stats", {
            admin: true,
          }),
          apiFetch<{ vendors: { id: string }[] }>("/api/admin/vendors/expiring?days=14", { admin: true }),
        ]);
        if (!cancelled) {
          setStats(s);
          setExpiringSoon(ex.vendors.length);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <header className="border-b border-slate-100 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Overview</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Platform health and quick links</p>
      </header>

      {err && (
        <div className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200/80">
          {err}
        </div>
      )}

      {stats && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm transition hover:border-brand-200/60 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vendors</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{stats.vendors}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <IconUsers className="h-6 w-6" />
              </div>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm transition hover:border-sky-200/60 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Messages sent</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{stats.messages_sent}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                <IconSend className="h-6 w-6" />
              </div>
            </div>
          </div>
          <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm transition hover:border-rose-200/60 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Failed</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{stats.messages_failed}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                <IconAlert className="h-6 w-6" />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/admin/vendors"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <IconUsers className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-slate-900">All vendors</div>
              <p className="text-xs text-slate-600">Plans, tiers, usage</p>
            </div>
          </div>
        </Link>
        <Link
          to="/admin/expiring"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
              <IconClock className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-slate-900">
                Expiring soon
                {expiringSoon !== null && expiringSoon > 0 && (
                  <span className="ml-2 inline-flex min-w-[1.5rem] justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900">
                    {expiringSoon}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600">Subscriptions · reminders</p>
            </div>
          </div>
        </Link>
        <Link
          to="/admin/templates"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-violet-300 hover:shadow-md sm:col-span-2 lg:col-span-2"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
              <IconTemplate className="h-5 w-5" />
            </span>
            <div>
              <div className="font-semibold text-slate-900">WhatsApp templates</div>
              <p className="text-xs text-slate-600">Catalog, approvals, Meta sync</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
