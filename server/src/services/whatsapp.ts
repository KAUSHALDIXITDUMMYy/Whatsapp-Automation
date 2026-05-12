import { config } from "../config.js";

function normalizeE164(toRaw: string): string {
  const s = toRaw.trim();
  if (s.includes("@")) return s;
  if (s.toLowerCase().startsWith("whatsapp:")) return normalizeE164(s.slice("whatsapp:".length));
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10) throw new Error("Invalid phone number");
  return `+${digits}`;
}

export async function sendWhatsAppMessage(
  toRaw: string,
  body: string,
  _options?: { from?: string }
): Promise<{ sid: string }> {
  if (!config.metaWhatsAppAccessToken?.trim() || !config.metaWhatsAppPhoneNumberId?.trim()) {
    console.warn("[whatsapp] Meta Cloud API not configured — dry run only");
    return { sid: `dry-${Date.now()}` };
  }

  const to = normalizeE164(toRaw);
  const url = `https://graph.facebook.com/${config.metaGraphVersion}/${encodeURIComponent(
    config.metaWhatsAppPhoneNumberId
  )}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.metaWhatsAppAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta WhatsApp send ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = JSON.parse(text) as { messages?: Array<{ id?: string }> };
  const id = data.messages?.[0]?.id;
  return { sid: typeof id === "string" && id.trim() ? id : `meta-${Date.now()}` };
}
