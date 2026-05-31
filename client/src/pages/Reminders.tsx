import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

type Rule = {
  id: string;
  name: string;
  date_field_key: string;
  trigger_type: string;
  days_before: number | null;
  is_active: boolean;
};

export default function Reminders() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("Recharge reminder");
  const [dateField] = useState("recharge_date");
  const [trigger, setTrigger] = useState<"on_date" | "before_days">("on_date");
  const [daysBefore, setDaysBefore] = useState(3);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const r = await apiFetch<{ rules: Rule[] }>("/api/reminders");
    setRules(r.rules);
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function addRule(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await apiFetch("/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          name,
          date_field_key: dateField,
          trigger_type: trigger,
          days_before: trigger === "before_days" ? daysBefore : null,
          is_active: true,
        }),
      });
      setName("Recharge reminder");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  async function toggle(id: string, active: boolean) {
    await apiFetch(`/api/reminders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !active }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this rule?")) return;
    await apiFetch(`/api/reminders/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Recharge reminders</h1>
      <p className="text-slate-600 text-sm mt-1">
        Uses template <code className="bg-slate-100 px-1 rounded">cable_recharge_reminder</code>. Due dates
        are set automatically from joining date (import or manual add). Mark rent received on the
        Subscribers page to stop reminders until the next period.
      </p>

      <form onSubmit={addRule} className="mt-6 max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">New rule</h2>
        <div>
          <label className="block text-xs font-medium text-slate-600">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={trigger === "on_date"}
              onChange={() => setTrigger("on_date")}
            />
            On due date
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={trigger === "before_days"}
              onChange={() => setTrigger("before_days")}
            />
            Days before
          </label>
        </div>
        {trigger === "before_days" && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Days before due date</label>
            <input
              type="number"
              min={0}
              value={daysBefore}
              onChange={(e) => setDaysBefore(parseInt(e.target.value, 10) || 0)}
              className="mt-1 w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
          Add rule
        </button>
      </form>

      <ul className="mt-8 space-y-2">
        {rules.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            <div>
              <span className="font-medium">{r.name}</span>
              <span className="text-slate-500 ml-2">
                {r.date_field_key} ·{" "}
                {r.trigger_type === "on_date" ? "on date" : `${r.days_before}d before`}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void toggle(r.id, r.is_active)}
                className="text-brand-600 hover:underline"
              >
                {r.is_active ? "Pause" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
