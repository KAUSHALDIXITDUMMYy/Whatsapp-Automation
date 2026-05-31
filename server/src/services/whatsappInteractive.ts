import { postMetaMessage, sendWhatsAppMessage } from "./whatsapp.js";
import { query } from "../db/pool.js";

function normalizeE164(toRaw: string): string {
  const s = toRaw.trim();
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10) return s;
  return `+${digits}`;
}

type ReplyButton = { id: string; title: string };
type ListRow = { id: string; title: string; description?: string };
type ListSection = { title: string; rows: ListRow[] };

async function sendInteractive(phone: string, interactive: Record<string, unknown>): Promise<{ sid: string }> {
  return postMetaMessage({
    messaging_product: "whatsapp",
    to: normalizeE164(phone),
    type: "interactive",
    interactive,
  });
}

export async function logOutboundSessionMessage(opts: {
  vendorId: string;
  customerId: string;
  phone: string;
  body: string;
  providerMessageId?: string;
}): Promise<void> {
  await query(
    `INSERT INTO messages_log (vendor_id, customer_id, phone, body, status, direction, provider_message_id, meta_message_id)
     VALUES ($1, $2, $3, $4, 'sent', 'outbound', $5, $5)`,
    [opts.vendorId, opts.customerId, opts.phone, opts.body, opts.providerMessageId ?? null]
  );
}

export async function sendReplyButtons(
  phone: string,
  bodyText: string,
  buttons: ReplyButton[],
  logOpts?: { vendorId: string; customerId: string }
): Promise<{ sid: string }> {
  const limited = buttons.slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
  }));

  const result = await sendInteractive(phone, {
    type: "button",
    body: { text: bodyText.slice(0, 1024) },
    action: { buttons: limited },
  });

  if (logOpts) {
    await logOutboundSessionMessage({
      ...logOpts,
      phone,
      body: `[Menu] ${bodyText}`,
      providerMessageId: result.sid,
    });
  }
  return result;
}

export async function sendListMessage(
  phone: string,
  bodyText: string,
  buttonLabel: string,
  sections: ListSection[],
  logOpts?: { vendorId: string; customerId: string }
): Promise<{ sid: string }> {
  const mapped = sections.map((s) => ({
    title: s.title.slice(0, 24),
    rows: s.rows.slice(0, 10).map((r) => ({
      id: r.id.slice(0, 200),
      title: r.title.slice(0, 24),
      ...(r.description ? { description: r.description.slice(0, 72) } : {}),
    })),
  }));

  const result = await sendInteractive(phone, {
    type: "list",
    body: { text: bodyText.slice(0, 1024) },
    action: {
      button: buttonLabel.slice(0, 20),
      sections: mapped,
    },
  });

  if (logOpts) {
    await logOutboundSessionMessage({
      ...logOpts,
      phone,
      body: `[List] ${bodyText}`,
      providerMessageId: result.sid,
    });
  }
  return result;
}

export async function sendFlowText(
  phone: string,
  body: string,
  opts?: { vendorId: string; customerId: string }
): Promise<{ sid: string }> {
  const result = await sendWhatsAppMessage(phone, body);
  if (opts) {
    await logOutboundSessionMessage({
      vendorId: opts.vendorId,
      customerId: opts.customerId,
      phone,
      body,
      providerMessageId: result.sid,
    });
  }
  return result;
}
