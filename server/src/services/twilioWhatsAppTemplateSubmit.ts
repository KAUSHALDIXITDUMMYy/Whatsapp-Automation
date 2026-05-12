import twilio from "twilio";
import { config } from "../config.js";
import {
  isTwilioTypesKey,
  parseTypesPayload,
  toTwilioRestTypePayload,
  type TwilioTypesKey,
} from "./twilioContentTypes.js";

/** Categories compatible with {@link createContentAndSubmitWhatsAppApproval}. AUTHENTICATION requires `whatsapp/authentication` content — create that in Twilio Console / Meta. */
export type WhatsAppTemplateCategoryTextSubmit = "UTILITY" | "MARKETING";

export type WhatsAppApprovalPoll = {
  status: string | undefined;
  rejectionReason: string | undefined;
};

/** WhatsApp requires lowercase [a-z0-9_]. */
export function normalizeWhatsAppTemplateName(raw: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (s || "template").slice(0, 512);
}

/** Twilio Content `friendly_name` — alphanumeric + underscore; max 64 per API. */
function friendlyNameFromSubmission(
  submissionId: string,
  displayName: string,
  /** Prefer WhatsApp/Meta template name so Console matches Meta + your submit payload. */
  whatsappTemplateName: string
): string {
  const base = normalizeWhatsAppTemplateName(whatsappTemplateName || displayName).slice(0, 40);
  const suf = submissionId.replace(/-/g, "").slice(0, 12);
  return `${base}_${suf}`.slice(0, 64);
}

export function sanitizeTemplateBody(body: string): string {
  return body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeTextPayloadBody(payload: Record<string, unknown>): Record<string, unknown> {
  if (typeof payload.body !== "string") return payload;
  return { ...payload, body: sanitizeTemplateBody(payload.body) };
}

function requireTwilioClient() {
  if (!config.twilioAccountSid?.trim() || !config.twilioAuthToken?.trim()) {
    throw new Error("Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to submit templates to WhatsApp.");
  }
  return twilio(config.twilioAccountSid, config.twilioAuthToken);
}

/**
 * Create Twilio Content (any supported `twilio/*` type) and submit for WhatsApp approval.
 * After success, poll {@link fetchWhatsAppApprovalFromTwilio} until Approved/Rejected.
 */
export async function createContentAndSubmitWhatsAppApproval(opts: {
  submissionId: string;
  displayName: string;
  whatsappTemplateName: string;
  category: WhatsAppTemplateCategoryTextSubmit;
  language?: string;
  twilioTypesKey: string;
  typesPayload: unknown;
}): Promise<{ contentSid: string; approvalStatus: string | undefined }> {
  const client = requireTwilioClient();
  const waNameForLabel = normalizeWhatsAppTemplateName(opts.whatsappTemplateName);
  const friendlyName = friendlyNameFromSubmission(opts.submissionId, opts.displayName, waNameForLabel);
  const lang = opts.language ?? "en";

  const key: TwilioTypesKey = isTwilioTypesKey(opts.twilioTypesKey) ? opts.twilioTypesKey : "twilio/text";
  let parsed = parseTypesPayload(key, opts.typesPayload) as Record<string, unknown>;
  if (key === "twilio/text") {
    parsed = sanitizeTextPayloadBody(parsed);
  }

  const restInner = toTwilioRestTypePayload(key, parsed);

  const types: Record<string, Record<string, unknown>> = { [key]: restInner };

  const created = await client.content.v1.contents.create({
    friendly_name: friendlyName,
    language: lang,
    types: types as Record<string, Record<string, string>>,
  } as Parameters<typeof client.content.v1.contents.create>[0]);

  const approval = await client.content.v1.contents(created.sid).approvalCreate.create({
    name: waNameForLabel,
    category: opts.category,
  });

  return {
    contentSid: created.sid,
    approvalStatus: approval.status,
  };
}

/** GET /v1/Content/{ContentSid}/ApprovalRequests — stable vs SDK surface differences. */
export async function fetchWhatsAppApprovalFromTwilio(contentSid: string): Promise<WhatsAppApprovalPoll> {
  if (!config.twilioAccountSid?.trim() || !config.twilioAuthToken?.trim()) {
    throw new Error("Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }
  const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64");
  const res = await fetch(`https://content.twilio.com/v1/Content/${encodeURIComponent(contentSid)}/ApprovalRequests`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Twilio ApprovalRequests ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = JSON.parse(text) as {
    whatsapp?: { status?: string; rejection_reason?: string; rejectionReason?: string };
  };
  const w = data.whatsapp;
  return {
    status: typeof w?.status === "string" ? w.status : undefined,
    rejectionReason:
      typeof w?.rejection_reason === "string"
        ? w.rejection_reason
        : typeof w?.rejectionReason === "string"
          ? w.rejectionReason
          : undefined,
  };
}

/** Normalize Twilio/Meta status for comparison. */
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
