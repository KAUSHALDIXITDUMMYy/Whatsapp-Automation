import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../api/client";
import TemplateContentForm from "../../components/TemplateContentForm";
import {
  CONTENT_TYPE_OPTIONS,
  defaultTypesPayload,
  normalizeContentTypeKey,
  type TemplateContentValue,
} from "../../constants/templateContent";
import { AdminBadge, WaBadge, inputBase, labelBase } from "./shared";
import type { VendorRow } from "./AdminVendors";

function formatTypeLabel(key: string | null | undefined): string {
  const k = normalizeContentTypeKey(key);
  const o = CONTENT_TYPE_OPTIONS.find((x) => x.value === k);
  return o?.label ?? k;
}

type MetaWhatsAppTemplate = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  language: string | null;
  body: string;
};

type TemplateSubmissionRow = {
  id: string;
  vendor_id: string | null;
  name: string;
  body: string;
  template_types_key?: string | null;
  types_payload?: Record<string, unknown> | null;
  external_template_id: string | null;
  meta_template_id?: string | null;
  whatsapp_template_name?: string | null;
  whatsapp_category?: string | null;
  whatsapp_approval_status?: string | null;
  whatsapp_rejection_reason?: string | null;
  admin_status: string;
  rejection_reason: string | null;
  resubmits_id: string | null;
  created_at: string;
  updated_at: string;
  vendor_company_name: string | null;
  vendor_email: string | null;
  vendor_subscription_tier: string | null;
};

export default function AdminTemplates() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [submissions, setSubmissions] = useState<TemplateSubmissionRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [catalogName, setCatalogName] = useState("");
  const [catalogContent, setCatalogContent] = useState<TemplateContentValue>({
    template_types_key: "text",
    types_payload: defaultTypesPayload("text"),
  });
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [extBySubmission, setExtBySubmission] = useState<Record<string, string>>({});
  const [assignCatalogId, setAssignCatalogId] = useState("");
  const [assignVendorId, setAssignVendorId] = useState("");
  const [waCategoryById, setWaCategoryById] = useState<Record<string, "UTILITY" | "MARKETING">>({});
  const [metaTemplates, setMetaTemplates] = useState<MetaWhatsAppTemplate[]>([]);
  const [metaConfigured, setMetaConfigured] = useState(true);
  const [metaLoading, setMetaLoading] = useState(false);
  const [assignVendorByMetaId, setAssignVendorByMetaId] = useState<Record<string, string>>({});

  async function loadMetaTemplates() {
    setMetaLoading(true);
    try {
      const d = await apiFetch<{ templates: MetaWhatsAppTemplate[]; configured: boolean }>(
        "/api/admin/whatsapp-templates",
        { admin: true }
      );
      setMetaTemplates(d.templates);
      setMetaConfigured(d.configured);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed to load Meta templates");
    } finally {
      setMetaLoading(false);
    }
  }

  async function assignMetaTemplate(t: MetaWhatsAppTemplate) {
    const vendorId = assignVendorByMetaId[t.id]?.trim();
    if (!vendorId) {
      setErr("Select a vendor to assign this Meta template.");
      return;
    }
    setErr(null);
    setTplMsg(null);
    try {
      const r = await apiFetch<{ template_id: string; already_assigned?: boolean }>(
        "/api/admin/whatsapp-templates/assign",
        {
          method: "POST",
          admin: true,
          body: JSON.stringify({
            vendor_id: vendorId,
            meta_template_id: t.id,
            name: t.name,
            body: t.body,
            language: t.language ?? "en",
          }),
        }
      );
      setTplMsg(
        r.already_assigned
          ? `“${t.name}” (${t.language ?? "en"}) was already assigned — vendor can use it under Send messages.`
          : `“${t.name}” (${t.language ?? "en"}) assigned — vendor can send it from Send messages.`
      );
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Assign failed");
    }
  }

  async function load() {
    const [v, t] = await Promise.all([
      apiFetch<{ vendors: VendorRow[] }>("/api/admin/vendors", { admin: true }),
      apiFetch<{ submissions: TemplateSubmissionRow[] }>("/api/admin/template-submissions", { admin: true }),
    ]);
    setVendors(v.vendors);
    setSubmissions(t.submissions);
  }

  useEffect(() => {
    void Promise.all([load(), loadMetaTemplates()]).catch((e) =>
      setErr(e instanceof Error ? e.message : "Failed")
    );
  }, []);

  async function submitCatalogTemplate(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setTplMsg(null);
    try {
      await apiFetch("/api/admin/template-submissions", {
        method: "POST",
        admin: true,
        body: JSON.stringify({
          name: catalogName.trim(),
          template_types_key: catalogContent.template_types_key,
          types_payload: catalogContent.types_payload,
        }),
      });
      setCatalogName("");
      setCatalogContent({
        template_types_key: "text",
        types_payload: defaultTypesPayload("text"),
      });
      setTplMsg("Platform catalog template submitted (pending approval).");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    }
  }

  async function approveSubmission(id: string) {
    setErr(null);
    setTplMsg(null);
    const ext = extBySubmission[id]?.trim() ?? "";
    try {
      await apiFetch(`/api/admin/template-submissions/${id}`, {
        method: "PATCH",
        admin: true,
        body: JSON.stringify({
          admin_status: "approved",
          ...(ext ? { external_template_id: ext } : {}),
        }),
      });
      setTplMsg("Approved.");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    }
  }

  async function rejectSubmission(id: string) {
    const reason = window.prompt("Rejection reason (shown to vendor):") ?? "";
    if (!reason.trim()) return;
    setErr(null);
    setTplMsg(null);
    try {
      await apiFetch(`/api/admin/template-submissions/${id}`, {
        method: "PATCH",
        admin: true,
        body: JSON.stringify({ admin_status: "rejected", rejection_reason: reason.trim() }),
      });
      setTplMsg("Rejected.");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    }
  }

  function waCategoryFor(id: string): "UTILITY" | "MARKETING" {
    return waCategoryById[id] ?? "UTILITY";
  }

  async function submitToWhatsApp(id: string) {
    setErr(null);
    setTplMsg(null);
    try {
      await apiFetch(`/api/admin/template-submissions/${id}/submit-whatsapp`, {
        method: "POST",
        admin: true,
        body: JSON.stringify({ category: waCategoryFor(id) }),
      });
      setTplMsg("Submitted to Meta — click Sync status (twice in dry-run mode without credentials).");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Submit failed");
    }
  }

  async function syncWhatsApp(id: string) {
    setErr(null);
    setTplMsg(null);
    try {
      const r = await apiFetch<{
        whatsapp_approval_status?: string;
        materialized_vendor_template?: boolean;
        message?: string;
      }>(`/api/admin/template-submissions/${id}/sync-whatsapp`, {
        method: "POST",
        admin: true,
        body: JSON.stringify({}),
      });
      setTplMsg(
        r.materialized_vendor_template
          ? "WhatsApp approved — vendor template is ready."
          : r.message ?? `WhatsApp: ${r.whatsapp_approval_status ?? "updated"}`
      );
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Sync failed");
    }
  }

  async function assignCatalog(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setTplMsg(null);
    if (!assignCatalogId || !assignVendorId) {
      setErr("Choose a catalog template and a vendor.");
      return;
    }
    try {
      await apiFetch(`/api/admin/template-submissions/${assignCatalogId}/assign`, {
        method: "POST",
        admin: true,
        body: JSON.stringify({ vendor_id: assignVendorId }),
      });
      setTplMsg("Template assigned to vendor.");
      setAssignCatalogId("");
      setAssignVendorId("");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Assign failed");
    }
  }

  return (
    <div>
      <header className="border-b border-slate-100 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-700">WhatsApp</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Template approvals</h1>
        <p className="mt-1 text-sm text-slate-600">
          Import approved templates from Meta WhatsApp Manager, assign to vendors, or manage in-app submissions.
        </p>
      </header>

      {tplMsg && (
        <p className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200/80">
          {tplMsg}
        </p>
      )}
      {err && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200/80">
          {err}
        </p>
      )}

      <section className="mt-8 rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Approved in Meta (WhatsApp Manager)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Live from your WABA — e.g. reminder, welcome_onboard, hello_world. Assign directly to a vendor for{" "}
              <strong>Send messages</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMetaTemplates()}
            disabled={metaLoading}
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-50"
          >
            {metaLoading ? "Loading…" : "Refresh from Meta"}
          </button>
        </div>

        {!metaConfigured && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
            Set <code className="text-xs">META_WHATSAPP_ACCESS_TOKEN</code> and{" "}
            <code className="text-xs">META_WHATSAPP_BUSINESS_ACCOUNT_ID</code> in server/.env, then refresh.
          </p>
        )}

        {metaConfigured && !metaLoading && metaTemplates.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">No active/approved templates returned from Meta for this WABA.</p>
        )}

        {metaTemplates.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-xl border border-emerald-100">
            <table className="min-w-full divide-y divide-emerald-100 text-sm">
              <thead>
                <tr className="bg-emerald-50/80 text-left text-xs font-semibold uppercase tracking-wider text-emerald-900">
                  <th className="px-4 py-3">Template name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Language</th>
                  <th className="min-w-[160px] px-4 py-3">Body preview</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="min-w-[220px] px-4 py-3">Assign to vendor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-50 bg-white">
                {metaTemplates.map((t) => (
                  <tr key={`${t.id}-${t.language ?? ""}`} className="align-top">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">{t.category ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{t.language ?? "—"}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      <span className="line-clamp-3" title={t.body}>
                        {t.body}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <select
                          value={assignVendorByMetaId[t.id] ?? ""}
                          onChange={(e) =>
                            setAssignVendorByMetaId((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          className={`${inputBase} min-w-[140px] py-2 text-xs`}
                        >
                          <option value="">Select vendor…</option>
                          {vendors.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.company_name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void assignMetaTemplate(t)}
                          className="shrink-0 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800"
                        >
                          Assign
                        </button>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-400">ID: {t.id}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-sm md:p-8">
        <div className="border-b border-slate-100 pb-4">
          <div className="rounded-xl bg-slate-50/80 p-4 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-100">
            <p>
              <span className="font-semibold text-slate-800">WhatsApp:</span> use{" "}
              <span className="font-medium text-slate-900">Submit to WhatsApp</span> (Meta API), then{" "}
              <span className="font-medium text-slate-900">Sync WhatsApp status</span>. Utility or Marketing only.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-slate-800">Manual CRM:</span> Approve / reject when templates are managed
              outside this flow.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <form onSubmit={submitCatalogTemplate} className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">New platform catalog template</h3>
            <input
              placeholder="Display name"
              value={catalogName}
              onChange={(e) => setCatalogName(e.target.value)}
              className={inputBase}
              required
            />
            <TemplateContentForm value={catalogContent} onChange={setCatalogContent} idPrefix="admin-catalog" />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:w-auto"
            >
              Add catalog submission
            </button>
          </form>

          <form
            onSubmit={assignCatalog}
            className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-5"
          >
            <h3 className="text-sm font-semibold text-slate-900">Assign approved catalog to vendor</h3>
            <div>
              <label className={labelBase}>Template</label>
              <select
                value={assignCatalogId}
                onChange={(e) => setAssignCatalogId(e.target.value)}
                className={`${inputBase} mt-2`}
              >
                <option value="">Select…</option>
                {submissions
                  .filter((s) => {
                    if (s.vendor_id) return false;
                    const waOk = (s.whatsapp_approval_status ?? "").toLowerCase() === "approved";
                    const adminOk = s.admin_status === "approved";
                    return waOk || adminOk;
                  })
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelBase}>Vendor</label>
              <select
                value={assignVendorId}
                onChange={(e) => setAssignVendorId(e.target.value)}
                className={`${inputBase} mt-2`}
              >
                <option value="">Select…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.company_name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              Assign to vendor
            </button>
          </form>
        </div>

        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/80 shadow-inner">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="bg-slate-50/95 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="whitespace-nowrap px-4 py-3">Type</th>
                  <th className="whitespace-nowrap px-4 py-3">Format</th>
                  <th className="whitespace-nowrap px-4 py-3">Vendor</th>
                  <th className="whitespace-nowrap px-4 py-3">Name</th>
                  <th className="min-w-[120px] px-4 py-3">Body</th>
                  <th className="whitespace-nowrap px-4 py-3">CRM</th>
                  <th className="min-w-[200px] px-4 py-3">WhatsApp / Meta</th>
                  <th className="min-w-[220px] px-4 py-3">Manual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {submissions.map((s) => (
                  <tr key={s.id} className="align-top transition hover:bg-slate-50/80">
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${
                            s.vendor_id ? "bg-violet-50 text-violet-800 ring-1 ring-violet-100" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                          }`}
                        >
                          {s.vendor_id ? "Vendor" : "Catalog"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {formatTypeLabel(s.template_types_key)}
                      </td>
                      <td className="px-4 py-4 text-xs">
                      <span className="font-medium text-slate-900">{s.vendor_company_name ?? "—"}</span>
                      {s.vendor_email && <div className="mt-0.5 text-slate-500">{s.vendor_email}</div>}
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-900">{s.name}</td>
                    <td className="max-w-[14rem] px-4 py-4 text-slate-600">
                      <span className="line-clamp-3" title={s.body}>
                        {s.body}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <AdminBadge status={s.admin_status} />
                    </td>
                    <td className="px-4 py-4">
                      {s.meta_template_id ? (
                        <div className="flex flex-col gap-2">
                          <code className="break-all rounded-lg bg-slate-100 px-2 py-1 text-[10px] leading-snug text-slate-700 ring-1 ring-slate-200/80">
                            {s.meta_template_id}
                            {s.meta_template_id.startsWith("dry-meta-") && (
                              <span className="ml-1 text-amber-700">(dry-run)</span>
                            )}
                          </code>
                          <WaBadge status={s.whatsapp_approval_status} />
                          <button
                            type="button"
                            onClick={() => void syncWhatsApp(s.id)}
                            className="inline-flex w-fit items-center rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700"
                          >
                            Sync status
                          </button>
                        </div>
                      ) : s.admin_status === "pending" || s.admin_status === "none" ? (
                        <div className="flex min-w-[140px] flex-col gap-2">
                          <select
                            value={waCategoryFor(s.id)}
                            onChange={(e) =>
                              setWaCategoryById((prev) => ({
                                ...prev,
                                [s.id]: e.target.value as "UTILITY" | "MARKETING",
                              }))
                            }
                            className={`${inputBase} py-2 text-xs`}
                          >
                            <option value="UTILITY">Utility</option>
                            <option value="MARKETING">Marketing</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => void submitToWhatsApp(s.id)}
                            className="inline-flex items-center justify-center rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-800"
                          >
                            Submit to WhatsApp
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {s.admin_status === "pending" || s.admin_status === "none" ? (
                        <div className="flex min-w-[200px] flex-col gap-2">
                          <input
                            placeholder="Meta template ID override (optional)"
                            value={extBySubmission[s.id] ?? ""}
                            onChange={(e) =>
                              setExtBySubmission((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                            className={`${inputBase} py-2 font-mono text-xs`}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void approveSubmission(s.id)}
                              className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => void rejectSubmission(s.id)}
                              className="inline-flex flex-1 items-center justify-center rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {s.admin_status === "rejected" && s.rejection_reason
                            ? `Admin: ${s.rejection_reason}`
                            : s.external_template_id ?? "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {submissions.length === 0 && (
            <p className="bg-white px-4 py-10 text-center text-sm text-slate-500">No template submissions yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
