import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Profile = {
  company_name: string;
  email: string;
  subscription_tier?: string;
};

type DashReminder = {
  id: string;
  message: string;
  created_at: string;
};

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
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
        const [me, rem] = await Promise.all([
          apiFetch<Profile>("/api/profile/me"),
          apiFetch<{ reminders: DashReminder[] }>("/api/profile/dashboard-reminders?unread=true"),
        ]);
        if (!cancelled) {
          setProfile(me);
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
            Welcome, <span className="font-medium text-slate-800">{profile.company_name}</span>
          </>
        ) : (
          "Loading…"
        )}
      </p>
      {err && <p className="text-red-600 text-sm mt-2">{err}</p>}

      {reminders.length > 0 && (
        <div className="mt-6 space-y-3">
          {reminders.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:justify-between"
            >
              <div>
                <p className="text-xs font-semibold uppercase text-amber-800">Alert</p>
                <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">{r.message}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</p>
              </div>
              <button
                type="button"
                onClick={() => void dismissReminder(r.id)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        <Link
          to="/customers/new"
          className="rounded-xl border border-brand-200 bg-brand-50 p-5 hover:border-brand-400"
        >
          <div className="text-sm font-semibold text-brand-800">Add subscriber</div>
          <p className="text-sm text-slate-600 mt-1">Sends welcome message automatically.</p>
        </Link>
        <Link to="/inbox" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400">
          <div className="text-sm font-semibold text-brand-700">Chats</div>
          <p className="text-sm text-slate-600 mt-1">Reply when customers choose chat with technician.</p>
        </Link>
        <Link
          to="/appointments"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400"
        >
          <div className="text-sm font-semibold text-brand-700">Technician visits</div>
          <p className="text-sm text-slate-600 mt-1">Bookings from WhatsApp.</p>
        </Link>
        <Link
          to="/call-requests"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400"
        >
          <div className="text-sm font-semibold text-brand-700">Call requests</div>
          <p className="text-sm text-slate-600 mt-1">Preferred times — call when you can.</p>
        </Link>
        <Link
          to="/reminders"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400"
        >
          <div className="text-sm font-semibold text-brand-700">Recharge reminders</div>
          <p className="text-sm text-slate-600 mt-1">Automatic due-date messages.</p>
        </Link>
        <Link
          to="/settings"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-brand-400"
        >
          <div className="text-sm font-semibold text-brand-700">Settings</div>
          <p className="text-sm text-slate-600 mt-1">Time slots and menu greeting.</p>
        </Link>
      </div>
    </div>
  );
}
