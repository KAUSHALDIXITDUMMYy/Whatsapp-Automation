import { config } from "../config.js";
import {
  isMetaTemplateApiConfigured,
  metaAuthHeaders,
  metaGraphUrl,
} from "./metaWhatsApp.js";
import { normalizeTemplateTypesKey, toMetaTemplateComponents } from "./templateContentTypes.js";

export type WhatsAppTemplateCategoryTextSubmit = "UTILITY" | "MARKETING";

export type WhatsAppApprovalPoll = {
  status: string | undefined;
  rejectionReason: string | undefined;
};

const drySyncCounts = new Map<string, number>();

/** WhatsApp / Meta template names: lowercase [a-z0-9_]. */
export function normalizeWhatsAppTemplateName(raw: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (s || "template").slice(0, 512);
}

export function sanitizeTemplateBody(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function dryTemplateId(submissionId: string): string {
  return `dry-meta-${submissionId.replace(/-/g, "").slice(0, 24)}`;
}

function mapMetaStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.toLowerCase();
}

/**
 * Create a message template via Meta Graph API and return Meta template id + status.
 * Dry-run when Meta credentials are missing: simulates submit (PENDING).
 */
export async function createAndSubmitWhatsAppTemplate(opts: {
  submissionId: string;
  whatsappTemplateName: string;
  category: WhatsAppTemplateCategoryTextSubmit;
  language?: string;
  templateTypesKey: string;
  typesPayload: unknown;
}): Promise<{ templateId: string; approvalStatus: string | undefined }> {
  const waName = normalizeWhatsAppTemplateName(opts.whatsappTemplateName);
  const rawLang = (opts.language ?? "en").trim().slice(0, 16);
  const lang = rawLang.includes("_") ? rawLang : `${rawLang}_US`;
  const typesKey = normalizeTemplateTypesKey(opts.templateTypesKey);

  if (!isMetaTemplateApiConfigured()) {
    console.warn("[meta-template] Meta template API not configured — dry run submit");
    drySyncCounts.set(opts.submissionId, 0);
    return { templateId: dryTemplateId(opts.submissionId), approvalStatus: "pending" };
  }

  let components: Array<Record<string, unknown>>;
  try {
    const parsed =
      typeof opts.typesPayload === "object" && opts.typesPayload !== null
        ? (opts.typesPayload as Record<string, unknown>)
        : { body: String(opts.typesPayload ?? "") };
    components = toMetaTemplateComponents(typesKey, parsed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }

  const url = metaGraphUrl(`${encodeURIComponent(config.metaWhatsAppBusinessAccountId)}/message_templates`);
  const res = await fetch(url, {
    method: "POST",
    headers: metaAuthHeaders(),
    body: JSON.stringify({
      name: waName,
      language: lang.includes("_") ? lang : `${lang}_US`,
      category: opts.category,
      components,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta message_templates ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text) as { id?: string; status?: string };
  drySyncCounts.delete(opts.submissionId);
  return {
    templateId: typeof data.id === "string" ? data.id : dryTemplateId(opts.submissionId),
    approvalStatus: mapMetaStatus(data.status) ?? "pending",
  };
}

/**
 * Poll Meta for template approval by template name (stored as whatsapp_template_name).
 * Dry-run: first sync stays pending, second sync returns approved (for local testing).
 */
export async function fetchWhatsAppTemplateApproval(opts: {
  submissionId: string;
  metaTemplateId: string;
  whatsappTemplateName: string;
}): Promise<WhatsAppApprovalPoll> {
  if (!isMetaTemplateApiConfigured() || opts.metaTemplateId.startsWith("dry-meta-")) {
    const n = (drySyncCounts.get(opts.submissionId) ?? 0) + 1;
    drySyncCounts.set(opts.submissionId, n);
    if (n >= 2) {
      return { status: "approved", rejectionReason: undefined };
    }
    return { status: "pending", rejectionReason: undefined };
  }

  const waName = normalizeWhatsAppTemplateName(opts.whatsappTemplateName);
  const fields = "id,name,status,rejected_reason,category,language";
  const url = metaGraphUrl(
    `${encodeURIComponent(config.metaWhatsAppBusinessAccountId)}/message_templates?fields=${fields}&name=${encodeURIComponent(waName)}`
  );

  const res = await fetch(url, { headers: metaAuthHeaders() });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta message_templates list ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text) as {
    data?: Array<{ id?: string; status?: string; rejected_reason?: string }>;
  };
  const row =
    data.data?.find((t) => t.id === opts.metaTemplateId) ?? data.data?.[0];
  return {
    status: mapMetaStatus(row?.status),
    rejectionReason:
      typeof row?.rejected_reason === "string" ? row.rejected_reason : undefined,
  };
}

export function isApprovedStatus(s: string | undefined): boolean {
  if (!s) return false;
  const x = s.toLowerCase();
  return x === "approved";
}

export function isRejectedStatus(s: string | undefined): boolean {
  if (!s) return false;
  const x = s.toLowerCase();
  return x === "rejected";
}

export type MetaListedTemplate = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  language: string | null;
  body: string;
  /** Full Meta template components (HEADER, BODY, BUTTONS, …). */
  components: unknown[];
};

/** Meta Manager "Active" templates are APPROVED (or ACTIVE*) in the API. */
export function isMetaTemplateUsable(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === "APPROVED" || s.startsWith("ACTIVE");
}

export function extractBodyFromMetaComponents(components: unknown): string {
  if (!Array.isArray(components)) return "";
  for (const c of components) {
    if (c && typeof c === "object") {
      const row = c as { type?: string; text?: string };
      if (row.type === "BODY" && typeof row.text === "string" && row.text.trim()) {
        return row.text.trim();
      }
    }
  }
  return "";
}

/**
 * List message templates from Meta WhatsApp Business Account (WhatsApp Manager).
 * Includes templates created directly in Meta, not only via this app.
 */
export async function listMetaWhatsAppTemplates(): Promise<MetaListedTemplate[]> {
  if (!isMetaTemplateApiConfigured()) {
    console.warn("[meta-template] Meta not configured — cannot list WhatsApp Manager templates");
    return [];
  }

  const fields = encodeURIComponent("id,name,status,category,language,components");
  const out: MetaListedTemplate[] = [];
  let url: string | null = metaGraphUrl(
    `${encodeURIComponent(config.metaWhatsAppBusinessAccountId)}/message_templates?limit=100&fields=${fields}`
  );

  while (url) {
    const res = await fetch(url, { headers: metaAuthHeaders() });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Meta message_templates list ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = JSON.parse(text) as {
      data?: Array<{
        id?: string;
        name?: string;
        status?: string;
        category?: string;
        language?: string;
        components?: unknown;
      }>;
      paging?: { next?: string };
    };

    for (const row of data.data ?? []) {
      if (!row.id || !row.name) continue;
      if (!isMetaTemplateUsable(row.status)) continue;
      const comps = Array.isArray(row.components) ? row.components : [];
      out.push({
        id: row.id,
        name: row.name,
        status: row.status ?? "unknown",
        category: row.category ?? null,
        language: row.language ?? null,
        body: extractBodyFromMetaComponents(comps) || `[${row.name}]`,
        components: comps,
      });
    }

    url = typeof data.paging?.next === "string" ? data.paging.next : null;
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

let templatesListCache: { at: number; list: MetaListedTemplate[] } | null = null;
const TEMPLATES_CACHE_MS = 60_000;

async function getCachedMetaTemplatesList(): Promise<MetaListedTemplate[]> {
  const now = Date.now();
  if (templatesListCache && now - templatesListCache.at < TEMPLATES_CACHE_MS) {
    return templatesListCache.list;
  }
  const list = await listMetaWhatsAppTemplates();
  templatesListCache = { at: now, list };
  return list;
}

function languageCodesMatch(a: string, b: string): boolean {
  return a.trim().replace(/-/g, "_").toLowerCase() === b.trim().replace(/-/g, "_").toLowerCase();
}

/**
 * Resolve the exact language code Meta has for this template (e.g. reminder → en_US, welcome_onboard → en).
 * Stored DB values can be wrong after defaults; Meta list is source of truth.
 */
export async function resolveMetaTemplateLanguage(opts: {
  templateName: string;
  storedLanguage?: string | null;
  metaTemplateId?: string | null;
}): Promise<string> {
  const normalizedName = normalizeWhatsAppTemplateName(opts.templateName);

  try {
    const list = await getCachedMetaTemplatesList();

    const metaId = opts.metaTemplateId?.trim();
    if (metaId) {
      const byId = list.find((t) => t.id === metaId);
      if (byId?.language?.trim()) return byId.language.trim();
    }

    const matches = list.filter((t) => normalizeWhatsAppTemplateName(t.name) === normalizedName);

    if (opts.storedLanguage?.trim()) {
      const stored = opts.storedLanguage.trim();
      const storedMatch = matches.find((t) => t.language && languageCodesMatch(t.language, stored));
      if (storedMatch?.language) return storedMatch.language.trim();
    }

    if (matches.length === 1 && matches[0].language?.trim()) {
      return matches[0].language.trim();
    }

    if (matches.length > 1) {
      const enUs = matches.find((t) => t.language === "en_US");
      if (enUs?.language) return enUs.language;
      const en = matches.find((t) => t.language === "en");
      if (en?.language) return en.language;
      if (matches[0].language?.trim()) return matches[0].language.trim();
    }
  } catch (e) {
    console.warn("[meta-template] resolveMetaTemplateLanguage failed:", e);
  }

  if (opts.storedLanguage?.trim()) return opts.storedLanguage.trim();
  return "en_US";
}

/** All approved language codes for a template name (for send retries). */
export async function listLanguagesForMetaTemplate(templateName: string): Promise<string[]> {
  const normalizedName = normalizeWhatsAppTemplateName(templateName);
  const list = await getCachedMetaTemplatesList();
  const langs = list
    .filter((t) => normalizeWhatsAppTemplateName(t.name) === normalizedName && t.language?.trim())
    .map((t) => t.language!.trim());
  return [...new Set(langs)];
}
