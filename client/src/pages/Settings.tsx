import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Me = {
  subscription_tier: string;
  subscription_expires_at: string | null;
  whatsapp_sender: string | null;
  welcome_on_create_enabled: boolean;
  appointment_slot_times: string[];
  appointment_days_ahead: number;
  whatsapp_menu_greeting: string | null;
  platform_templates?: { welcome: string; recharge: string };
  billing_cycle?: string;
};

const DEFAULT_SLOTS = "09:00, 10:00, 11:00, 12:00, 14:00, 15:00, 16:00, 17:00";

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const [sender, setSender] = useState("");
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [slotTimesText, setSlotTimesText] = useState(DEFAULT_SLOTS);
  const [daysAhead, setDaysAhead] = useState(7);
  const [menuGreeting, setMenuGreeting] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Me>("/api/profile/me")
      .then((profile) => {
        setMe(profile);
        setSender(profile.whatsapp_sender ?? "");
        setWelcomeEnabled(profile.welcome_on_create_enabled ?? true);
        const slots = Array.isArray(profile.appointment_slot_times)
          ? profile.appointment_slot_times
          : [];
        setSlotTimesText(slots.length ? slots.join(", ") : DEFAULT_SLOTS);
        setDaysAhead(profile.appointment_days_ahead ?? 7);
        setMenuGreeting(profile.whatsapp_menu_greeting ?? "");
        setBillingCycle(profile.billing_cycle ?? "monthly");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function saveAutomation(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const slots = slotTimesText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await apiFetch("/api/profile/me", {
        method: "PATCH",
        body: JSON.stringify({
          welcome_on_create_enabled: welcomeEnabled,
          appointment_slot_times: slots,
          appointment_days_ahead: daysAhead,
          whatsapp_menu_greeting: menuGreeting.trim() || null,
          billing_cycle: billingCycle,
        }),
      });
      setMsg("Settings saved.");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  async function saveSender(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await apiFetch("/api/profile/me", {
        method: "PATCH",
        body: JSON.stringify({ whatsapp_sender: sender.trim() || "" }),
      });
      setMsg("Saved.");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  if (!me && !err) return <p className="text-slate-600">Loading…</p>;

  const pro = me?.subscription_tier === "pro";

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-600 text-sm mt-1">
          WhatsApp templates are managed by the platform. You only configure slots and greetings.
        </p>
      </div>

      {err && <p className="text-red-600 text-sm">{err}</p>}
      {msg && <p className="text-green-700 text-sm">{msg}</p>}

      {me?.platform_templates && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong>Platform templates:</strong> welcome ={" "}
          <code className="bg-white px-1 rounded">{me.platform_templates.welcome}</code>, recharge ={" "}
          <code className="bg-white px-1 rounded">{me.platform_templates.recharge}</code>
        </div>
      )}

      <form onSubmit={saveAutomation} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">Automation</h2>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={welcomeEnabled}
            onChange={(e) => setWelcomeEnabled(e.target.checked)}
          />
          Send welcome message when a new subscriber is added
        </label>

        <div>
          <label className="block text-xs font-medium text-slate-600">Recharge billing cycle</label>
          <select
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Due date = joining date + one period, then repeats. Changing this recalculates all subscribers.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">WhatsApp menu greeting</label>
          <textarea
            value={menuGreeting}
            onChange={(e) => setMenuGreeting(e.target.value)}
            rows={3}
            placeholder="Hello! Choose a service below…"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Shown when customer sends Hi — options: Book technician, Schedule call, Chat technician.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">
            Available time slots (visits & calls)
          </label>
          <input
            value={slotTimesText}
            onChange={(e) => setSlotTimesText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">Booking days ahead</label>
          <input
            type="number"
            min={1}
            max={30}
            value={daysAhead}
            onChange={(e) => setDaysAhead(parseInt(e.target.value, 10) || 7)}
            className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
          Save
        </button>
      </form>

      <p className="text-sm text-slate-600">
        Recharge reminders: add field <code className="bg-slate-100 px-1 rounded">recharge_date</code> under{" "}
        <Link to="/fields" className="text-brand-600 underline">
          Custom fields
        </Link>
        , then rules on <Link to="/reminders" className="text-brand-600 underline">Recharge reminders</Link>.
      </p>

      {pro && (
        <form onSubmit={saveSender} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-800">WhatsApp sender (Pro)</h2>
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="+15551234567"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          />
          <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
            Save sender
          </button>
        </form>
      )}
    </div>
  );
}
