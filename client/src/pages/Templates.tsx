import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import TemplateContentForm from "../components/TemplateContentForm";
import {
  CONTENT_TYPE_OPTIONS,
  defaultTypesPayload,
  type TemplateContentValue,
} from "../constants/templateContent";

type Limits = { tier: string; basic_max_templates: number; template_count: number };
type SavedTpl = {
  id: string;
  name: string;
  body: string;
  external_template_id: string | null;
  source_submission_id: string | null;
  created_at: string;
};
type Submission = {
  id: string;
  name: string;
  body: string;
  twilio_types_key?: string | null;
  types_payload?: Record<string, unknown> | null;
  external_template_id: string | null;
  admin_status: string;
  whatsapp_approval_status: string | null;
  whatsapp_rejection_reason: string | null;
  rejection_reason: string | null;
  resubmits_id: string | null;
  created_at: string;
  updated_at: string;
};

function formatLabel(key: string | null | undefined): string {
  if (!key) return "Text";
  const o = CONTENT_TYPE_OPTIONS.find((x) => x.value === key);
  return o?.label ?? key;
}

export default function Templates() {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [saved, setSaved] = useState<SavedTpl[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState<TemplateContentValue>({
    twilio_types_key: "twilio/text",
    types_payload: defaultTypesPayload("twilio/text"),
  });
  const [resubmitOf, setResubmitOf] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isPro = limits?.tier === "pro";

  async function load() {
    const [t, s] = await Promise.all([
      apiFetch<{ templates: SavedTpl[]; limits: Limits }>("/api/messaging/templates"),
      apiFetch<{ submissions: Submission[] }>("/api/messaging/template-submissions"),
    ]);
    setSaved(t.templates);
    setLimits(t.limits);
    setSubmissions(s.submissions);
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!isPro) return;
    try {
      await apiFetch("/api/messaging/template-submissions", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          twilio_types_key: content.twilio_types_key,
          types_payload: content.types_payload,
          ...(resubmitOf ? { resubmits_id: resubmitOf } : {}),
        }),
      });
      setName("");
      setContent({
        twilio_types_key: "twilio/text",
        types_payload: defaultTypesPayload("twilio/text"),
      });
      setResubmitOf(null);
      setMsg(resubmitOf ? "Resubmission recorded." : "Submission recorded — platform admin may submit it to WhatsApp.");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    }
  }

  function startResubmit(sub: Submission) {
    setResubmitOf(sub.id);
    setName(sub.name);
    const key = sub.twilio_types_key || "twilio/text";
    const raw = sub.types_payload;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      setContent({
        twilio_types_key: key,
        types_payload: { ...(raw as Record<string, unknown>) },
      });
    } else {
      setContent({
        twilio_types_key: "twilio/text",
        types_payload: { body: sub.body },
      });
    }
    setMsg(null);
    setErr(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteSaved(id: string) {
    if (!confirm("Remove this template from your account?")) return;
    setErr(null);
    try {
      await apiFetch(`/api/messaging/templates/${id}`, { method: "DELETE" });
      await load();
      setMsg("Template removed.");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Delete failed");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Message templates</h1>
      <p className="text-slate-600 text-sm mt-1">
        WhatsApp requires administrator approval (and Meta/Twilio registration) before templates can be used for many
        outbound sends. Choose a content type (Text, Quick Reply, Call to action, List Picker, Catalog) in Twilio/Meta
        format.{" "}
        <Link to="/campaign" className="text-brand-700 font-medium hover:underline">
          Send messages
        </Link>
      </p>

      {limits && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="font-semibold capitalize">{limits.tier}</span> plan
          {limits.tier === "basic" && (
            <span className="text-slate-600">
              {" "}
              — assigned templates {limits.template_count} / {limits.basic_max_templates}
            </span>
          )}
        </div>
      )}

      {!isPro && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">Basic plan</p>
          <p className="mt-1 text-amber-900/90">
            You cannot submit new templates yourself. Contact your platform administrator to request templates; once
            they approve and assign them, they appear below and in Send messages.
          </p>
        </div>
      )}

      {isPro && (
        <form onSubmit={onSubmit} className="mt-8 max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            {resubmitOf ? "Resubmit template for approval" : "Submit new template for approval"}
          </h2>
          {resubmitOf && (
            <p className="text-xs text-slate-600">
              Replacing a disapproved request. You can edit the name and structured content before sending.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600">Template name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <TemplateContentForm value={content} onChange={setContent} idPrefix="vendor-tpl" />

          {resubmitOf && (
            <button
              type="button"
              onClick={() => {
                setResubmitOf(null);
                setName("");
                setContent({
                  twilio_types_key: "twilio/text",
                  types_payload: defaultTypesPayload("twilio/text"),
                });
              }}
              className="text-sm text-slate-600 underline"
            >
              Cancel resubmit
            </button>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
            {resubmitOf ? "Submit resubmission" : "Submit for approval"}
          </button>
        </form>
      )}

      {isPro && submissions.length > 0 && (
        <div className="mt-10">
          <h2 className="font-semibold text-slate-900">Your submissions</h2>
          <ul className="mt-3 space-y-3">
            {submissions.map((s) => {
              const wa = (s.whatsapp_approval_status ?? "").toLowerCase();
              const waRejected = wa === "rejected";
              const waApproved = wa === "approved";
              const adminRejected = s.admin_status === "rejected";
              const adminApproved = s.admin_status === "approved";
              const anyRejected = adminRejected || waRejected;
              return (
                <li key={s.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{s.name}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-900">
                      {formatLabel(s.twilio_types_key)}
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-800">
                      Admin: {s.admin_status ?? "—"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        waApproved || adminApproved
                          ? "bg-green-100 text-green-800"
                          : waRejected || adminRejected
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      WhatsApp: {s.whatsapp_approval_status ?? "—"}
                    </span>
                  </div>
                  <p className="text-slate-600 mt-2 whitespace-pre-wrap">{s.body}</p>
                  {adminRejected && s.rejection_reason && (
                    <p className="text-red-700 text-xs mt-2">
                      <span className="font-medium">Admin:</span> {s.rejection_reason}
                    </p>
                  )}
                  {waRejected && s.whatsapp_rejection_reason && (
                    <p className="text-red-700 text-xs mt-2">
                      <span className="font-medium">WhatsApp:</span> {s.whatsapp_rejection_reason}
                    </p>
                  )}
                  {anyRejected && (
                    <button
                      type="button"
                      onClick={() => startResubmit(s)}
                      className="mt-2 text-sm font-medium text-brand-700 hover:underline"
                    >
                      Resubmit with changes
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-semibold text-slate-900">Saved templates (for sending)</h2>
        <p className="text-xs text-slate-600 mt-1">
          {isPro
            ? "After Meta/WhatsApp approves the template (or an admin approves manually), it appears here."
            : "Templates assigned by your administrator appear here."}
        </p>
        {saved.length === 0 ? (
          <p className="text-sm text-slate-500 mt-3">No templates yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {saved.map((t) => (
              <li key={t.id} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <p className="text-slate-600 mt-1 whitespace-pre-wrap">{t.body}</p>
                    {t.external_template_id && (
                      <p className="text-xs text-slate-500 mt-2 font-mono">ID: {t.external_template_id}</p>
                    )}
                  </div>
                  {isPro && (
                    <button
                      type="button"
                      onClick={() => void deleteSaved(t.id)}
                      className="shrink-0 text-red-600 text-xs hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
