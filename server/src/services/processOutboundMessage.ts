import { query } from "../db/pool.js";
import {
  prepareMetaTemplateSend,
  sendMetaTemplateWithLanguageFallback,
} from "./metaTemplateSend.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import {
  getVendorSubscription,
  isSubscriptionActive,
  resolveOutboundWhatsAppFrom,
} from "./subscription.js";

/** Shared by BullMQ worker and inline mode (SKIP_REDIS). */
export async function processOutboundMessage(logId: string): Promise<void> {
  const r = await query<{
    phone: string;
    body: string;
    vendor_id: string;
    platform_template_name: string | null;
    customer_name: string | null;
    custom_fields: Record<string, unknown> | null;
  }>(
    `SELECT m.phone, m.body, m.vendor_id, m.platform_template_name,
            c.name AS customer_name, c.custom_fields
     FROM messages_log m
     LEFT JOIN customers c ON c.id = m.customer_id
     WHERE m.id = $1`,
    [logId]
  );
  if (r.rows.length === 0) return;
  const row = r.rows[0];

  const vendor = await getVendorSubscription(row.vendor_id);
  if (!vendor || !isSubscriptionActive(vendor)) {
    await query(`UPDATE messages_log SET status = 'failed', provider_error = $2 WHERE id = $1`, [
      logId,
      "Subscription inactive or expired",
    ]);
    return;
  }

  const fromOpt = resolveOutboundWhatsAppFrom(vendor);
  const rechargeDate =
    row.custom_fields && typeof row.custom_fields.recharge_date === "string"
      ? String(row.custom_fields.recharge_date).slice(0, 10)
      : null;

  try {
    let result: { sid: string };

    if (row.platform_template_name?.trim()) {
      const prepared = await prepareMetaTemplateSend({
        templateName: row.platform_template_name.trim(),
        fallbackBody: rechargeDate
          ? `Dear {{1}}, your recharge is due on {{2}}.`
          : `Hello {{1}}, welcome aboard!`,
        customerName: row.customer_name,
      });

      const sent = await sendMetaTemplateWithLanguageFallback(row.phone, prepared);
      result = { sid: sent.sid };
    } else {
      result = await sendWhatsAppMessage(row.phone, row.body, fromOpt ? { from: fromOpt } : undefined);
    }

    await query(
      `UPDATE messages_log SET status = 'sent', provider_message_id = $2, meta_message_id = $2 WHERE id = $1`,
      [logId, result.sid]
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await query(`UPDATE messages_log SET status = 'failed', provider_error = $2 WHERE id = $1`, [logId, msg]);
    throw e;
  }
}
