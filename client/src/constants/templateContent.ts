/** Twilio Content types for WhatsApp template submissions (aligned with server twilioContentTypes). */

export const CONTENT_TYPE_OPTIONS = [
  { value: "twilio/text", label: "Text", hint: "Plain message body" },
  { value: "twilio/quick-reply", label: "Quick Reply", hint: "Body + tap buttons" },
  { value: "twilio/call-to-action", label: "Call to action", hint: "Body + URL or phone buttons" },
  { value: "twilio/list-picker", label: "List Picker", hint: "Menu of choices" },
  { value: "twilio/catalog", label: "Catalog", hint: "Product-style items" },
] as const;

export type TemplateContentValue = {
  twilio_types_key: string;
  types_payload: Record<string, unknown>;
};

export function defaultTypesPayload(twilioTypesKey: string): Record<string, unknown> {
  switch (twilioTypesKey) {
    case "twilio/text":
      return { body: "" };
    case "twilio/quick-reply":
      return {
        body: "",
        actions: [
          { id: "opt_a", title: "Yes" },
          { id: "opt_b", title: "No" },
        ],
      };
    case "twilio/call-to-action":
      return {
        body: "",
        actions: [{ type: "URL", title: "Visit site", url: "https://example.com" }],
      };
    case "twilio/list-picker":
      return {
        body: "Choose an option:",
        button: "See options",
        items: [
          { id: "1", item: "First", description: "" },
          { id: "2", item: "Second", description: "" },
        ],
      };
    case "twilio/catalog":
      return {
        title: "Products",
        body: "Browse our catalog.",
        subtitle: "",
        items: [{ name: "Sample item", description: "", mediaUrl: "" }],
      };
    default:
      return { body: "" };
  }
}
