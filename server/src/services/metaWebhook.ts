import { query } from "../db/pool.js";
import { processCustomerWhatsAppFlow } from "./customerWhatsAppFlows.js";

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function extractInboundText(msg: Record<string, unknown>): string {
  const type = String(msg.type ?? "text");
  if (type === "text") {
    const t = msg.text as { body?: string } | undefined;
    return (t?.body ?? "").trim() || "[text]";
  }
  if (type === "button") {
    const b = msg.button as { text?: string } | undefined;
    return (b?.text ?? "").trim() || "[button]";
  }
  if (type === "interactive") {
    const i = msg.interactive as {
      button_reply?: { title?: string };
      list_reply?: { title?: string };
    };
    return i?.button_reply?.title ?? i?.list_reply?.title ?? "[interactive]";
  }
  if (type === "image") return "[image]";
  if (type === "audio") return "[audio]";
  if (type === "video") return "[video]";
  if (type === "document") return "[document]";
  if (type === "location") return "[location]";
  return `[${type}]`;
}

async function findCustomerByWaId(waId: string): Promise<{
  id: string;
  vendor_id: string;
  name: string;
  phone: string;
} | null> {
  const digits = digitsOnly(waId);
  if (digits.length < 10) return null;

  const r = await query<{
    id: string;
    vendor_id: string;
    name: string;
    phone: string;
  }>(
    `SELECT id, vendor_id, name, phone FROM customers
     WHERE regexp_replace(phone, '\\D', '', 'g') = $1
        OR regexp_replace(phone, '\\D', '', 'g') = right($1, 10)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [digits]
  );
  return r.rows[0] ?? null;
}

async function storeInboundMessage(opts: {
  vendorId: string;
  customerId: string;
  phone: string;
  body: string;
  metaMessageId: string;
}): Promise<void> {
  const dup = await query(`SELECT id FROM messages_log WHERE meta_message_id = $1 LIMIT 1`, [
    opts.metaMessageId,
  ]);
  if (dup.rows.length > 0) return;

  await query(
    `INSERT INTO messages_log (vendor_id, customer_id, phone, body, status, direction, meta_message_id)
     VALUES ($1, $2, $3, $4, 'received', 'inbound', $5)`,
    [opts.vendorId, opts.customerId, opts.phone, opts.body, opts.metaMessageId]
  );
}

async function handleStatuses(statuses: unknown[]): Promise<void> {
  for (const raw of statuses) {
    const s = raw as { id?: string; status?: string };
    const id = s.id?.trim();
    const status = s.status?.trim();
    if (!id || !status) continue;

    const mapped =
      status === "delivered" ? "delivered" : status === "read" ? "read" : status === "sent" ? "sent" : null;
    if (!mapped) continue;

    await query(
      `UPDATE messages_log SET status = $2
       WHERE (meta_message_id = $1 OR provider_message_id = $1) AND direction = 'outbound'`,
      [id, mapped]
    );
  }
}

async function handleInboundMessages(
  value: Record<string, unknown>,
  messages: unknown[]
): Promise<void> {
  const contacts = (value.contacts as Array<{ wa_id?: string; profile?: { name?: string } }>) ?? [];
  const contactNameByWa = new Map<string, string>();
  for (const c of contacts) {
    const wa = c.wa_id?.trim();
    const name = c.profile?.name?.trim();
    if (wa && name) contactNameByWa.set(digitsOnly(wa), name);
  }

  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    const from = String(msg.from ?? "").trim();
    const metaId = String(msg.id ?? "").trim();
    if (!from || !metaId) continue;

    const customer = await findCustomerByWaId(from);
    if (!customer) {
      console.warn("[meta-webhook] inbound from unknown number", from);
      continue;
    }

    const body = extractInboundText(msg);
    const waName = contactNameByWa.get(digitsOnly(from));
    if (waName && (!customer.name || customer.name === customer.phone)) {
      await query(`UPDATE customers SET name = $2, updated_at = NOW() WHERE id = $1`, [
        customer.id,
        waName,
      ]);
    }

    await storeInboundMessage({
      vendorId: customer.vendor_id,
      customerId: customer.id,
      phone: customer.phone,
      body,
      metaMessageId: metaId,
    });

    try {
      await processCustomerWhatsAppFlow(customer, msg);
    } catch (e) {
      console.error("[meta-webhook] customer flow error", e);
    }
  }
}

/** Parse Meta WhatsApp Cloud API webhook payload. */
export async function handleMetaWhatsAppWebhook(body: unknown): Promise<void> {
  const payload = body as { object?: string; entry?: unknown[] };
  if (payload.object !== "whatsapp_business_account") return;

  for (const entry of payload.entry ?? []) {
    const e = entry as { changes?: unknown[] };
    for (const change of e.changes ?? []) {
      const c = change as { value?: Record<string, unknown> };
      const value = c.value;
      if (!value) continue;

      if (Array.isArray(value.statuses)) {
        await handleStatuses(value.statuses);
      }
      if (Array.isArray(value.messages)) {
        await handleInboundMessages(value, value.messages);
      }
    }
  }
}
