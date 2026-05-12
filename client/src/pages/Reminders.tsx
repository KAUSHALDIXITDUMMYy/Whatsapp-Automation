import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

type Rule = {
  id: string;
  name: string;
  date_field_key: string;
  trigger_type: string;
  days_before: number | null;
  template_id: string | null;
  template_name: string | null;
  is_active: boolean;
};
type Template = { id: string; name: string };

export default function Reminders() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [dateField, setDateField] = useState("recharge_date");
  const [trigger, setTrigger] = useState<"on_date" | "before_days">("on_date");
  const [daysBefore, setDaysBefore] = useState(3);
  const [templateId, setTemplateId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const [r, t] = await Promise.all([
      apiFetch<{ rules: Rule[] }>("/api/reminders"),
      apiFetch<{ templates: Template[] }>("/api/messaging/templates"),
    ]);
    setRules(r.rules);
    setTemplates(t.templates);
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
          template_id: templateId || null,
          is_active: true,
        }),
      });
      setName("");
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
      <h1 className="text-2xl font-bold text-slate-900">Reminder automation</h1>
      <p className="text-slate-600 text-sm mt-1">
        Daily job matches dates stored in <code className="bg-slate-100 px-1 rounded">custom_fields</code>{" "}
        and queues WhatsApp messages once per day per customer.
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
            placeholder="Recharge reminder"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Date field key (in custom_fields)</label>
          <input
            required
            value={dateField}
            onChange={(e) => setDateField(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={trigger === "on_date"}
              onChange={() => setTrigger("on_date")}
            />
            On the date
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
            <label className="block text-xs font-medium text-slate-600">Days before</label>
            <input
              type="number"
              min={0}
              value={daysBefore}
              onChange={(e) => setDaysBefore(parseInt(e.target.value, 10) || 0)}
              className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600">Message template</label>
          <select
            required
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
          Save rule
        </button>
      </form>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Trigger</th>
              <th className="px-4 py-3 font-medium">Template</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.date_field_key}</td>
                <td className="px-4 py-3">
                  {r.trigger_type === "before_days"
                    ? `${r.days_before ?? 0} day(s) before`
                    : "On date"}
                </td>
                <td className="px-4 py-3">{r.template_name ?? "—"}</td>
                <td className="px-4 py-3">{r.is_active ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    type="button"
                    className="text-brand-700 hover:underline text-xs"
                    onClick={() => void toggle(r.id, r.is_active)}
                  >
                    Toggle
                  </button>
                  <button
                    type="button"
                    className="text-red-600 hover:underline text-xs"
                    onClick={() => void remove(r.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
