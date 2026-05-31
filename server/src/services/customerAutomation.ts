import { query } from "../db/pool.js";
import { config } from "../config.js";
import { enqueueOutboundMessage } from "./messageJobs.js";
import { getVendorSubscription, isSubscriptionActive } from "./subscription.js";

/** Queue platform welcome template when a new subscriber is added. */
export async function queueWelcomeMessage(vendorId: string, customerId: string): Promise<void> {
  const vendor = await getVendorSubscription(vendorId);
  if (!vendor || !isSubscriptionActive(vendor)) return;

  const settings = await query<{ welcome_on_create_enabled: boolean }>(
    `SELECT welcome_on_create_enabled FROM vendors WHERE id = $1`,
    [vendorId]
  );
  if (settings.rows.length === 0 || !settings.rows[0].welcome_on_create_enabled) return;

  const customer = await query<{ phone: string; name: string }>(
    `SELECT phone, name FROM customers WHERE vendor_id = $1 AND id = $2`,
    [vendorId, customerId]
  );
  if (customer.rows.length === 0) return;

  const templateName = config.metaTemplateWelcome;
  const log = await query<{ id: string }>(
    `INSERT INTO messages_log (vendor_id, customer_id, phone, body, status, direction, platform_template_name)
     VALUES ($1, $2, $3, $4, 'queued', 'outbound', $5)
     RETURNING id`,
    [
      vendorId,
      customerId,
      customer.rows[0].phone,
      `[template:${templateName}]`,
      templateName,
    ]
  );

  await enqueueOutboundMessage(log.rows[0].id);
}
