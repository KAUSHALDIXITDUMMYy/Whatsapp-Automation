import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Template = { id: string; name: string; body: string };
type Customer = { id: string; name: string; phone: string };
type Group = { id: string; name: string };
type Limits = {
  tier: string;
  basic_max_templates: number;
  template_count: number;
};

export default function Campaign() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [limits, setLimits] = useState<Limits | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [body, setBody] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [cfKey, setCfKey] = useState("");
  const [cfVal, setCfVal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  /** Only vendors explicitly on Pro get Pro UX; unknown/unloaded tier stays Basic-safe (needs template). */
  const isPro = limits?.tier === "pro";
  const isBasic = !isPro;

  async function refreshTemplates() {
    const d = await apiFetch<{ templates: Template[]; limits: Limits }>("/api/messaging/templates");
    setTemplates(d.templates);
    setLimits(d.limits);
  }

  useEffect(() => {
    void Promise.all([
      refreshTemplates().catch(() => {}),
      apiFetch<{ customers: Customer[] }>("/api/customers").then((d) => setCustomers(d.customers)),
      apiFetch<{ groups: Group[] }>("/api/groups").then((d) => setGroups(d.groups)),
    ]);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      if (isBasic && !templateId) throw new Error("Basic plan requires selecting a saved template.");
      if (isPro && !templateId && !body.trim()) {
        throw new Error("Select a saved template or type a message body.");
      }

      if (mode === "single") {
        if (!customerId) throw new Error("Select a customer");
        await apiFetch("/api/messaging/send", {
          method: "POST",
          body: JSON.stringify({
            mode: "single",
            customer_id: customerId,
            body: !isBasic ? body.trim() || undefined : undefined,
            template_id: templateId || undefined,
          }),
        });
      } else {
        const filters: { tags?: string[]; tag_mode?: "any" | "all"; custom_fields?: Record<string, string> } =
          {};
        if (tagFilter.trim()) filters.tags = tagFilter.split(",").map((t) => t.trim()).filter(Boolean);
        if (filters.tags?.length) filters.tag_mode = "any";
        if (cfKey.trim() && cfVal.trim()) filters.custom_fields = { [cfKey.trim()]: cfVal.trim() };

        await apiFetch("/api/messaging/send", {
          method: "POST",
          body: JSON.stringify({
            mode: "bulk",
            body: !isBasic ? body.trim() || undefined : undefined,
            template_id: templateId || undefined,
            group_id: groupId || undefined,
            filters: !groupId ? filters : undefined,
          }),
        });
      }
      setMsg("Messages queued for delivery.");
      if (!isBasic) setBody("");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Send failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Send WhatsApp messages</h1>
      <p className="text-slate-600 text-sm mt-1">
        Manage templates under{" "}
        <Link to="/templates" className="text-brand-700 font-medium hover:underline">
          Templates
        </Link>
        . Basic plans use assigned templates only; Pro can submit templates for approval and use custom message text.
        Configure{" "}
        <Link to="/settings" className="text-brand-700 font-medium hover:underline">
          WhatsApp sender (Pro)
        </Link>
        .
      </p>

      {limits && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="font-semibold capitalize">{limits.tier}</span> plan
          {isBasic && (
            <span className="text-slate-600">
              {" "}
              — templates {limits.template_count} / {limits.basic_max_templates}
            </span>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 max-w-xl space-y-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "single"} onChange={() => setMode("single")} />
            Single customer
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === "bulk"} onChange={() => setMode("bulk")} />
            Bulk (filters or group)
          </label>
        </div>

        {mode === "single" ? (
          <div>
            <label className="block text-sm font-medium text-slate-700">Customer</label>
            <select
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="block text-xs font-medium text-slate-600">Dynamic group (optional)</label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">— none —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            {!groupId && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Tags (comma-separated, match any)
                  </label>
                  <input
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Custom field key</label>
                    <input
                      value={cfKey}
                      onChange={(e) => setCfKey(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Value</label>
                    <input
                      value={cfVal}
                      onChange={(e) => setCfVal(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Template {isBasic ? "(required)" : "(optional)"}
          </label>
          <select
            required={isBasic}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {!isBasic && <option value="">— custom body below —</option>}
            {isBasic && <option value="">Choose a template…</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Message body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder={isBasic ? "Not used on Basic — pick a template above." : "Hi — custom text (Pro)"}
            disabled={isBasic}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            {isBasic
              ? "Basic sends only text from your saved templates."
              : "Pro: use a template, custom body, or both (body overrides when both are set)."}
          </p>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}

        <button type="submit" className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-medium">
          Queue send
        </button>
      </form>

      <div className="mt-10 max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <Link to="/templates" className="font-semibold text-brand-700 hover:underline">
          Templates & approvals →
        </Link>
        <p className="text-xs text-slate-600 mt-2">
          Pro users submit new templates for administrator approval. Basic users receive templates assigned by an
          administrator.
        </p>
      </div>
    </div>
  );
}
