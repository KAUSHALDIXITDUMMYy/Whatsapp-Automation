import { z } from "zod";

/** Template content types stored in DB and submitted to Meta message_templates API. */
export const TEMPLATE_TYPE_KEYS = [
  "text",
  "quick_reply",
  "call_to_action",
  "list_picker",
  "catalog",
] as const;

export type TemplateTypesKey = (typeof TEMPLATE_TYPE_KEYS)[number];

/** Legacy Twilio-style keys from older rows / clients. */
const LEGACY_TYPE_KEY_MAP: Record<string, TemplateTypesKey> = {
  "twilio/text": "text",
  "twilio/quick-reply": "quick_reply",
  "twilio/call-to-action": "call_to_action",
  "twilio/list-picker": "list_picker",
  "twilio/catalog": "catalog",
};

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

const validators: Record<TemplateTypesKey, z.ZodType<Record<string, unknown>>> = {
  text: textSchema,
  quick_reply: quickReplySchema,
  call_to_action: callToActionSchema,
  list_picker: listPickerSchema,
  catalog: catalogSchema,
};

export function normalizeTemplateTypesKey(k: string): TemplateTypesKey {
  const trimmed = k.trim();
  if ((TEMPLATE_TYPE_KEYS as readonly string[]).includes(trimmed)) {
    return trimmed as TemplateTypesKey;
  }
  const legacy = LEGACY_TYPE_KEY_MAP[trimmed];
  if (legacy) return legacy;
  return "text";
}

export function isTemplateTypesKey(k: string): k is TemplateTypesKey {
  return (TEMPLATE_TYPE_KEYS as readonly string[]).includes(k);
}

export function parseTypesPayload(templateTypesKey: string, raw: unknown): Record<string, unknown> {
  const key = normalizeTemplateTypesKey(templateTypesKey);
  const v = validators[key];
  return v.parse(raw) as Record<string, unknown>;
}

export function normalizeTemplateSubmissionInput(input: {
  template_types_key?: string | undefined;
  twilio_types_key?: string | undefined;
  types_payload?: unknown;
  body?: string | undefined;
}): { template_types_key: TemplateTypesKey; types_payload: Record<string, unknown>; body: string } {
  let template_types_key = normalizeTemplateTypesKey(
    input.template_types_key ?? input.twilio_types_key ?? "text"
  );
  let rawPayload = input.types_payload;
  if (rawPayload === undefined && typeof input.body === "string" && input.body.trim() !== "") {
    template_types_key = "text";
    rawPayload = { body: input.body.trim() };
  }
  if (rawPayload === undefined) {
    throw new Error("Provide types_payload (and template_types_key), or body for plain text.");
  }
  const types_payload = parseTypesPayload(template_types_key, rawPayload) as Record<string, unknown>;
  const body = primaryBodyFromPayload(template_types_key, types_payload);
  return { template_types_key, types_payload, body };
}

export function primaryBodyFromPayload(templateTypesKey: string, payload: Record<string, unknown>): string {
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (body) return body.slice(0, 8000);
  if (normalizeTemplateTypesKey(templateTypesKey) === "catalog" && typeof payload.title === "string") {
    return `[Catalog] ${payload.title}`.slice(0, 8000);
  }
  return JSON.stringify(payload).slice(0, 8000);
}

/** Build Meta Cloud API `components` for POST /{WABA}/message_templates */
export function toMetaTemplateComponents(
  templateTypesKey: string,
  parsed: Record<string, unknown>
): Array<Record<string, unknown>> {
  const key = normalizeTemplateTypesKey(templateTypesKey);
  const bodyText =
    typeof parsed.body === "string" ? parsed.body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";

  if (key === "list_picker" || key === "catalog") {
    throw new Error(
      "List picker and catalog templates are not supported via Meta API submit. Use Text, Quick reply, or Call to action, or create complex templates in Meta Business Manager."
    );
  }

  const components: Array<Record<string, unknown>> = [{ type: "BODY", text: bodyText }];

  if (key === "quick_reply") {
    const actions = parsed.actions as Array<{ title?: string }> | undefined;
    if (actions?.length) {
      components.push({
        type: "BUTTONS",
        buttons: actions.slice(0, 3).map((a) => ({
          type: "QUICK_REPLY",
          text: String(a.title ?? "").slice(0, 25),
        })),
      });
    }
  }

  if (key === "call_to_action") {
    const actions = parsed.actions as Array<{
      type?: string;
      title?: string;
      url?: string;
      phone?: string;
    }> | undefined;
    if (actions?.length) {
      const buttons = actions.slice(0, 2).map((a) => {
        if (a.type === "PHONE_NUMBER") {
          return {
            type: "PHONE_NUMBER",
            text: String(a.title ?? "").slice(0, 25),
            phone_number: String(a.phone ?? "").replace(/\D/g, ""),
          };
        }
        return {
          type: "URL",
          text: String(a.title ?? "").slice(0, 25),
          url: String(a.url ?? "https://example.com"),
        };
      });
      components.push({ type: "BUTTONS", buttons });
    }
  }

  return components;
}
