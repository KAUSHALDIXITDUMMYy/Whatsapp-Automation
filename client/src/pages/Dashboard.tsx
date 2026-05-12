import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Profile = {
  company_name: string;
  email: string;
  subscription_tier?: string;
  subscription_expires_at?: string | null;
  limits?: { basic_max_templates: number; template_count: number };
};
type Logs = { total: number };

type DashReminder = {
  id: string;
  message: string;
  created_at: string;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<Logs | null>(null);
  const [reminders, setReminders] = useState<DashReminder[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const dismissReminder = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/profile/dashboard-reminders/${id}/read`, { method: "PATCH" });
      setReminders((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, lg, rem] = await Promise.all([
          apiFetch<Profile>("/api/profile/me"),
          apiFetch<Logs>("/api/messaging/logs?limit=1"),
          apiFetch<{ reminders: DashReminder[] }>("/api/profile/dashboard-reminders?unread=true"),
        ]);
        if (!cancelled) {
          setProfile(me);
          setLogs(lg);
          setReminders(rem.reminders ?? []);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-600 mt-1">
        {profile ? (
          <>
            Welcome back, <span className="font-medium text-slate-800">{profile.company_name}</span>
            {profile.subscription_tier && (
              <span className="ml-2 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold capitalize text-slate-800">
                {profile.subscription_tier}
              </span>
            )}
          </>
        ) : (
          "Loading…"
        )}
      </p>
      {profile?.subscription_tier === "basic" && profile.limits && (
        <p className="text-xs text-slate-500 mt-2">
          Templates: {profile.limits.template_count} / {profile.limits.basic_max_templates} (Basic).{" "}
          <Link to="/settings" className="text-brand-700 hover:underline">
            Account
          </Link>
        </p>
      )}
      {err && <p className="text-red-600 text-sm mt-2">{err}</p>}

      {reminders.length > 0 && (
        <div className="mt-6 space-y-3">
          {reminders.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Message from your administrator</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{r.message}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void dismissReminder(r.id)}
                className="shrink-0 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
        <Link
          to="/customers"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400 transition"
        >
          <div className="text-sm font-semibold text-brand-700">Customers</div>
          <p className="text-sm text-slate-600 mt-2">View and edit contacts, tags, and custom fields.</p>
        </Link>
        <Link
          to="/import"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400 transition"
        >
          <div className="text-sm font-semibold text-brand-700">Import CSV</div>
          <p className="text-sm text-slate-600 mt-2">Upload spreadsheets and save mapping templates.</p>
        </Link>
        <Link
          to="/campaign"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400 transition"
        >
          <div className="text-sm font-semibold text-brand-700">Send messages</div>
          <p className="text-sm text-slate-600 mt-2">WhatsApp campaigns to one customer or a segment.</p>
        </Link>
        <Link
          to="/reminders"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400 transition"
        >
          <div className="text-sm font-semibold text-brand-700">Reminders</div>
          <p className="text-sm text-slate-600 mt-2">Automations tied to dates in custom fields.</p>
        </Link>
      </div>

      {logs && (
        <p className="mt-8 text-sm text-slate-600">
          Total messages logged: <span className="font-semibold">{logs.total}</span>
        </p>
      )}
    </div>
  );
}
