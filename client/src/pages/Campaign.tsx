import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";

type Template = {
  id: string;
  name: string;
  body: string;
  external_template_id?: string | null;
  whatsapp_template_name?: string | null;
};

type Customer = { id: string; name: string; phone: string };
type Group = { id: string; name: string };
type Limits = {
  tier: string;
  basic_max_templates: number;
  template_count: number;
};

function previewBody(text: string, max = 80): string {
  const one = text.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

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
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const isPro = limits?.tier === "pro";
  const isBasic = !isPro;
  const selectedTemplate = templates.find((t) => t.id === templateId);

  async function refreshTemplates() {
    setLoadingTemplates(true);
    try {
      const d = await apiFetch<{ templates: Template[]; limits: Limits }>("/api/messaging/templates");
      setTemplates(d.templates);
      setLimits(d.limits);
      if (templateId && !d.templates.some((t) => t.id === templateId)) {
        setTemplateId("");
      }
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    void Promise.all([
      refreshTemplates().catch(() => {}),
      apiFetch<{ customers: Customer[] }>("/api/customers").then((d) => setCustomers(d.customers)),
      apiFetch<{ groups: Group[] }>("/api/groups").then((d) => setGroups(d.groups)),
    ]);
  }, []);

  useEffect(() => {
    if (!templateId) {
      if (isBasic) setBody("");
      return;
    }
    const t = templates.find((x) => x.id === templateId);
    if (t) setBody(t.body);
  }, [templateId, templates, isBasic]);

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
      if (!isBasic && !templateId) setBody("");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Send failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Send WhatsApp messages</h1>
      <p className="text-slate-600 text-sm mt-1">
        Choose an <strong>approved Meta template</strong> below — it is sent as a real WhatsApp template (works
        without the customer messaging you first). Plain custom text only works within 24h after they reply.
      </p>

      {limits && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-semibold capitalize">{limits.tier}</span> plan
            {isBasic && (
              <span className="text-slate-600">
                {" "}
                — templates {limits.template_count} / {limits.basic_max_templates}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void refreshTemplates()}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Refresh templates
          </button>
        </div>
      )}

      {!loadingTemplates && templates.length === 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">No approved templates ready to send</p>
          <p className="mt-1 text-amber-900/90">
            {isPro
              ? "Submit a template under Templates, then ask admin to approve it and submit/sync with Meta. Approved templates appear here automatically."
              : "Ask your administrator to approve a template and assign it to your account (catalog assign)."}
          </p>
          <Link to="/templates" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
            Go to Templates →
          </Link>
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
            Approved template {isBasic ? "(required)" : "(optional)"}
          </label>
          <select
            required={isBasic}
            disabled={loadingTemplates || (templates.length === 0 && isBasic)}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          >
            {loadingTemplates && <option value="">Loading templates…</option>}
            {!loadingTemplates && !isBasic && <option value="">— custom body only —</option>}
            {!loadingTemplates && isBasic && templates.length === 0 && (
              <option value="">No approved templates yet</option>
            )}
            {!loadingTemplates && isBasic && templates.length > 0 && (
              <option value="">Choose a template…</option>
            )}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {previewBody(t.body)}
              </option>
            ))}
          </select>
          {selectedTemplate && (
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
              <span className="font-semibold">Selected:</span> {selectedTemplate.name}
              {selectedTemplate.whatsapp_template_name && (
                <span className="ml-1 text-emerald-800">
                  (Meta: {selectedTemplate.whatsapp_template_name})
                </span>
              )}
              <p className="mt-1 whitespace-pre-wrap text-slate-700">{selectedTemplate.body}</p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Message body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder={
              isBasic
                ? "Filled from the template you select above."
                : "Select a template to preview its body, or type custom text (overrides template when sending)."
            }
            disabled={isBasic && !templateId}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            {isBasic
              ? "Basic: sends the selected Meta template (not editable free text)."
              : "Pro: with a Meta template selected, WhatsApp sends that template. Custom text below is only used if you do not select a template."}
          </p>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}

        <button
          type="submit"
          disabled={isBasic && templates.length === 0}
          className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          Queue send
        </button>
      </form>
    </div>
  );
}
