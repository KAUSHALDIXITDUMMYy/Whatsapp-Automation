import { query } from "../db/pool.js";
import { config } from "../config.js";
import { enqueueOutboundMessage } from "./messageJobs.js";
import { shouldSkipRechargeReminder, parseISODate } from "./billingCycle.js";
import { getVendorSubscription, isSubscriptionActive } from "./subscription.js";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function runDailyReminderScan(): Promise<{ scanned: number; queued: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const templateName = config.metaTemplateRecharge;

  const rules = await query<{
    id: string;
    vendor_id: string;
    date_field_key: string;
    trigger_type: string;
    days_before: number | null;
  }>(
    `SELECT id, vendor_id, date_field_key, trigger_type, days_before
     FROM reminder_rules WHERE is_active = true`
  );

  let queued = 0;

  for (const rule of rules.rows) {
    const vendorSub = await getVendorSubscription(rule.vendor_id);
    if (!vendorSub || !isSubscriptionActive(vendorSub)) continue;

    const customers = await query<{
      id: string;
      phone: string;
      recharge_date: string | null;
      rent_paid_until: string | null;
      custom_fields: Record<string, unknown>;
    }>(
      `SELECT id, phone, recharge_date, rent_paid_until, custom_fields FROM customers WHERE vendor_id = $1`,
      [rule.vendor_id]
    );

    for (const c of customers.rows) {
      const eventDate =
        parseISODate(c.recharge_date) ??
        parseISODate(c.custom_fields[rule.date_field_key]) ??
        null;
      if (!eventDate) continue;

      if (
        shouldSkipRechargeReminder({
          eventDate,
          rentPaidUntil: parseISODate(c.rent_paid_until),
        })
      ) {
        continue;
      }

      let fireToday = false;
      if (rule.trigger_type === "on_date") {
        fireToday = eventDate === today;
      } else if (rule.trigger_type === "before_days" && rule.days_before != null) {
        const triggerOn = addDays(eventDate, -rule.days_before);
        fireToday = triggerOn === today;
      }

      if (!fireToday) continue;

      const disp = await query<{ id: string }>(
        `INSERT INTO reminder_dispatch_log (rule_id, customer_id, dispatch_date)
         VALUES ($1, $2, $3)
         ON CONFLICT (rule_id, customer_id, dispatch_date) DO NOTHING
         RETURNING id`,
        [rule.id, c.id, today]
      );
      if (disp.rows.length === 0) continue;

      const log = await query<{ id: string }>(
        `INSERT INTO messages_log (vendor_id, customer_id, phone, body, status, platform_template_name)
         VALUES ($1, $2, $3, $4, 'queued', $5)
         RETURNING id`,
        [rule.vendor_id, c.id, c.phone, `[template:${templateName}]`, templateName]
      );
      await enqueueOutboundMessage(log.rows[0].id);
      queued++;
    }
  }

  return { scanned: rules.rows.length, queued };
}
