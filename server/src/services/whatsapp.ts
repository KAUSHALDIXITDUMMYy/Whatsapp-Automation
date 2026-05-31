import { config } from "../config.js";
import { isMetaWhatsAppConfigured } from "./metaWhatsApp.js";
import { normalizeWhatsAppTemplateName } from "./metaWhatsAppTemplate.js";

function normalizeE164(toRaw: string): string {
  const s = toRaw.trim();
  if (s.includes("@")) return s;
  if (s.toLowerCase().startsWith("whatsapp:")) return normalizeE164(s.slice("whatsapp:".length));
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("Invalid phone number");
  return `+${digits}`;
}

/**
 * Meta template language must match WhatsApp Manager exactly (e.g. en vs en_US).
 * Do not map en → en_US — templates like welcome_onboard are often approved only as en.
 */
export function normalizeMetaLanguageCode(raw: string | null | undefined): string {
  const s = (raw ?? "en").trim().replace(/-/g, "_");
  if (!s) return "en";
  return s;
}

export async function postMetaMessage(payload: Record<string, unknown>): Promise<{ sid: string }> {
  if (!isMetaWhatsAppConfigured()) {
    console.warn("[whatsapp] Meta Cloud API not configured — dry run only");
    return { sid: `dry-${Date.now()}` };
  }

  const url = `https://graph.facebook.com/${config.metaGraphVersion}/${encodeURIComponent(
    config.metaWhatsAppPhoneNumberId
  )}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.metaWhatsAppAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta WhatsApp send ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text) as { messages?: Array<{ id?: string }> };
  const id = data.messages?.[0]?.id;
  return { sid: typeof id === "string" && id.trim() ? id : `meta-${Date.now()}` };
}

/** Session message (plain text) — only works within 24h after customer last messaged you. */
export async function sendWhatsAppMessage(
  toRaw: string,
  body: string,
  _options?: { from?: string }
): Promise<{ sid: string }> {
  const to = normalizeE164(toRaw);
  return postMetaMessage({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body },
  });
}

/**
 * Business-initiated template message — works without customer sending "Hi" first.
 * `name` must match the template name in WhatsApp Manager (e.g. hello_world, reminder).
 */
export async function sendWhatsAppTemplateMessage(
  toRaw: string,
  opts: {
    templateName: string;
    languageCode: string;
    components?: Array<Record<string, unknown>>;
  }
): Promise<{ sid: string }> {
  const to = normalizeE164(toRaw);
  const name = normalizeWhatsAppTemplateName(opts.templateName);
  const language = { code: normalizeMetaLanguageCode(opts.languageCode) };

  const template: Record<string, unknown> = { name, language };
  if (opts.components?.length) {
    template.components = opts.components;
  }

  return postMetaMessage({
    messaging_product: "whatsapp",
    to,
    type: "template",
    template,
  });
}

/** Highest {{n}} index in an approved template body (e.g. "Hi {{1}}" → 1). */
export function countTemplateVariables(templateBody: string): number {
  let max = 0;
  for (const m of templateBody.matchAll(/\{\{(\d+)\}\}/g)) {
    const n = parseInt(m[1] ?? "0", 10);
    if (n > max) max = n;
  }
  return max;
}

/**
 * Meta send payload for BODY variables {{1}}, {{2}}, …
 * `values[0]` → {{1}}, `values[1]` → {{2}}, etc.
 */
export function buildTemplateVariableComponents(
  templateBody: string,
  values: string[]
): Array<Record<string, unknown>> | undefined {
  const slotsFromBody = countTemplateVariables(templateBody);
  const slots = Math.max(slotsFromBody, values.length);
  if (slots === 0) return undefined;

  const parameters: Array<{ type: string; text: string }> = [];
  for (let i = 0; i < slots; i++) {
    const text = (values[i] ?? "").trim().slice(0, 1024) || "—";
    parameters.push({ type: "text", text });
  }

  return [{ type: "body", parameters }];
}

/** True when this saved template should be sent via Meta template API (not plain text). */
export function shouldSendAsMetaTemplate(row: {
  external_template_id: string | null;
  template_name: string | null;
}): boolean {
  const ext = row.external_template_id?.trim();
  const name = row.template_name?.trim();
  if (!ext || !name || ext.startsWith("dry-")) return false;
  return true;
}
