import { z } from "zod";

/** Keys accepted in Twilio Content API `types` object for WhatsApp submission (subset matching Console). */
export const TWILIO_TYPE_KEYS = [
  "twilio/text",
  "twilio/quick-reply",
  "twilio/call-to-action",
  "twilio/list-picker",
  "twilio/catalog",
] as const;

export type TwilioTypesKey = (typeof TWILIO_TYPE_KEYS)[number];

const textSchema = z.object({
  body: z.string().min(1).max(4096),
});

const quickReplySchema = z.object({
  body: z.string().min(1).max(1024),
  actions: z
    .array(
      z.object({
        id: z.string().min(1).max(256),
        title: z.string().min(1).max(24),
      })
    )
    .min(1)
    .max(3),
});

const ctaActionSchema = z.union([
  z.object({
    type: z.literal("URL"),
    title: z.string().min(1).max(24),
    url: z.string().min(1).max(2048),
    id: z.string().max(256).optional(),
  }),
  z.object({
    type: z.literal("PHONE_NUMBER"),
    title: z.string().min(1).max(24),
    phone: z.string().min(4).max(32),
    id: z.string().max(256).optional(),
  }),
]);

const callToActionSchema = z.object({
  body: z.string().min(1).max(1024),
  actions: z.array(ctaActionSchema).min(1).max(2),
});

const listPickerSchema = z.object({
  body: z.string().min(1).max(1024),
  button: z.string().min(1).max(20),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(256),
        item: z.string().min(1).max(24),
        description: z.string().max(72).optional(),
      })
    )
    .min(1)
    .max(10),
});

const catalogItemSchema = z.object({
  id: z.string().max(256).optional(),
  sectionTitle: z.string().max(60).optional(),
  name: z.string().min(1).max(60),
  mediaUrl: z.string().max(2048).optional(),
  price: z.number().optional(),
  description: z.string().max(300).optional(),
});

const catalogSchema = z.object({
  title: z.string().max(60).optional(),
  body: z.string().min(1).max(1024),
  subtitle: z.string().max(60).optional(),
  items: z.array(catalogItemSchema).min(1).max(30),
});

const validators: Record<TwilioTypesKey, z.ZodType<Record<string, unknown>>> = {
  "twilio/text": textSchema,
  "twilio/quick-reply": quickReplySchema,
  "twilio/call-to-action": callToActionSchema,
  "twilio/list-picker": listPickerSchema,
  "twilio/catalog": catalogSchema,
};

export function isTwilioTypesKey(k: string): k is TwilioTypesKey {
  return (TWILIO_TYPE_KEYS as readonly string[]).includes(k);
}

/** Validate and return payload suitable for Twilio `types[twilio_types_key]` (REST uses snake_case keys on outer Content only; inner shapes match Twilio docs). */
export function parseTypesPayload(twilioTypesKey: string, raw: unknown): Record<string, unknown> {
  if (!isTwilioTypesKey(twilioTypesKey)) {
    throw new Error(`Unsupported content type: ${twilioTypesKey}`);
  }
  const v = validators[twilioTypesKey];
  const parsed = v.parse(raw) as Record<string, unknown>;
  return parsed;
}

/** Short text for message_templates.body / listing. */
/** HTTP body → validated storage shape + display `body` column. */
export function normalizeTemplateSubmissionInput(input: {
  twilio_types_key?: string | undefined;
  types_payload?: unknown;
  body?: string | undefined;
}): { twilio_types_key: TwilioTypesKey; types_payload: Record<string, unknown>; body: string } {
  let twilio_types_key = input.twilio_types_key ?? "twilio/text";
  let rawPayload = input.types_payload;
  if (rawPayload === undefined && typeof input.body === "string" && input.body.trim() !== "") {
    twilio_types_key = "twilio/text";
    rawPayload = { body: input.body.trim() };
  }
  if (rawPayload === undefined) {
    throw new Error("Provide types_payload (and twilio_types_key), or body for plain text.");
  }
  const key: TwilioTypesKey = isTwilioTypesKey(twilio_types_key) ? twilio_types_key : "twilio/text";
  const types_payload = parseTypesPayload(key, rawPayload) as Record<string, unknown>;
  const body = primaryBodyFromPayload(key, types_payload);
  return { twilio_types_key: key, types_payload, body };
}

export function primaryBodyFromPayload(twilioTypesKey: string, payload: Record<string, unknown>): string {
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (body) return body.slice(0, 8000);
  if (twilioTypesKey === "twilio/catalog" && typeof payload.title === "string") {
    return `[Catalog] ${payload.title}`.slice(0, 8000);
  }
  return JSON.stringify(payload).slice(0, 8000);
}

/**
 * Twilio Content REST expects snake_case for nested fields (e.g. media_url, section_title).
 * Our validators use camelCase for ergonomics; convert before create().
 */
export function toTwilioRestTypePayload(twilioTypesKey: TwilioTypesKey, parsed: Record<string, unknown>): Record<string, unknown> {
  switch (twilioTypesKey) {
    case "twilio/text":
      return { body: parsed.body };
    case "twilio/quick-reply":
      return {
        body: parsed.body,
        actions: parsed.actions,
      };
    case "twilio/call-to-action":
      return {
        body: parsed.body,
        actions: parsed.actions,
      };
    case "twilio/list-picker": {
      const items = (parsed.items as Array<{ id: string; item: string; description?: string }>).map((row) => ({
        id: row.id,
        item: row.item,
        ...(row.description != null && row.description !== "" ? { description: row.description } : {}),
      }));
      return {
        body: parsed.body,
        button: parsed.button,
        items,
      };
    }
    case "twilio/catalog": {
      const rawItems = parsed.items as Array<{
        id?: string;
        sectionTitle?: string;
        name: string;
        mediaUrl?: string;
        price?: number;
        description?: string;
      }>;
      const items = rawItems.map((i) => ({
        ...(i.id ? { id: i.id } : {}),
        ...(i.sectionTitle ? { section_title: i.sectionTitle } : {}),
        name: i.name,
        ...(i.mediaUrl ? { media_url: i.mediaUrl } : {}),
        ...(i.price != null ? { price: i.price } : {}),
        ...(i.description ? { description: i.description } : {}),
      }));
      return {
        ...(parsed.title ? { title: parsed.title } : {}),
        body: parsed.body,
        ...(parsed.subtitle ? { subtitle: parsed.subtitle } : {}),
        items,
      };
    }
    default:
      return parsed;
  }
}
