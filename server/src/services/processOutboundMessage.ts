import { query } from "../db/pool.js";
import { sendWhatsAppMessage } from "./whatsapp.js";
import {
  getVendorSubscription,
  isSubscriptionActive,
  resolveOutboundWhatsAppFrom,
} from "./subscription.js";

/** Shared by BullMQ worker and inline mode (SKIP_REDIS). */
export async function processOutboundMessage(logId: string): Promise<void> {
  const r = await query<{ phone: string; body: string; vendor_id: string }>(
    `SELECT m.phone, m.body, m.vendor_id FROM messages_log m WHERE m.id = $1`,
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

  try {
    const result = await sendWhatsAppMessage(row.phone, row.body, fromOpt ? { from: fromOpt } : undefined);
    await query(`UPDATE messages_log SET status = 'sent', provider_message_id = $2 WHERE id = $1`, [
      logId,
      result.sid,
    ]);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await query(`UPDATE messages_log SET status = 'failed', provider_error = $2 WHERE id = $1`, [logId, msg]);
    throw e;
  }
}
