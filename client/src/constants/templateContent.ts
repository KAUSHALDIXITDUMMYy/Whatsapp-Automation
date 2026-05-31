/** WhatsApp template content types (aligned with server templateContentTypes). */
export const CONTENT_TYPE_OPTIONS = [
  { value: "text", label: "Text", hint: "Plain message body" },
  { value: "quick_reply", label: "Quick Reply", hint: "Body + tap buttons" },
  { value: "call_to_action", label: "Call to action", hint: "Body + URL or phone buttons" },
  { value: "list_picker", label: "List Picker", hint: "Saved locally; create in Meta Manager for live use" },
  { value: "catalog", label: "Catalog", hint: "Saved locally; create in Meta Manager for live use" },
] as const;

export type TemplateContentValue = {
  template_types_key: string;
  types_payload: Record<string, unknown>;
};

/** Normalize legacy twilio/* keys from older API rows. */
export function normalizeContentTypeKey(key: string | null | undefined): string {
  if (!key) return "text";
  const map: Record<string, string> = {
    "twilio/text": "text",
    "twilio/quick-reply": "quick_reply",
    "twilio/call-to-action": "call_to_action",
    "twilio/list-picker": "list_picker",
    "twilio/catalog": "catalog",
  };
  return map[key] ?? key;
}

export function defaultTypesPayload(templateTypesKey: string): Record<string, unknown> {
  const key = normalizeContentTypeKey(templateTypesKey);
  switch (key) {
    case "text":
      return { body: "" };
    case "quick_reply":
      return {
        body: "",
        actions: [
          { id: "btn_1", title: "Yes" },
          { id: "btn_2", title: "No" },
        ],
      };
    case "call_to_action":
      return {
        body: "",
        actions: [{ type: "URL", title: "Visit", url: "https://example.com" }],
      };
    case "list_picker":
      return {
        body: "",
        button: "Options",
        items: [{ id: "opt_1", item: "Option 1" }],
      };
    case "catalog":
      return {
        title: "",
        body: "",
        items: [{ name: "Item 1" }],
      };
    default:
      return { body: "" };
  }
}
