import { query } from "../db/pool.js";
import { enqueueOutboundMessage, resolveTemplateBody } from "./messageJobs.js";
import { getVendorSubscription, isSubscriptionActive } from "./subscription.js";

function parseISODate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function runDailyReminderScan(): Promise<{ scanned: number; queued: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const rules = await query<{
    id: string;
    vendor_id: string;
    date_field_key: string;
    trigger_type: string;
    days_before: number | null;
    template_id: string | null;
  }>(
    `SELECT id, vendor_id, date_field_key, trigger_type, days_before, template_id
     FROM reminder_rules WHERE is_active = true`
  );

  let queued = 0;

  for (const rule of rules.rows) {
    if (!rule.template_id) continue;

    const vendorSub = await getVendorSubscription(rule.vendor_id);
    if (!vendorSub || !isSubscriptionActive(vendorSub)) continue;

    const customers = await query<{
      id: string;
      phone: string;
      custom_fields: Record<string, unknown>;
    }>(
      `SELECT id, phone, custom_fields FROM customers WHERE vendor_id = $1`,
      [rule.vendor_id]
    );

    for (const c of customers.rows) {
      const raw = c.custom_fields[rule.date_field_key];
      const eventDate = parseISODate(raw);
      if (!eventDate) continue;

      let fireToday = false;
      if (rule.trigger_type === "on_date") {
        fireToday = eventDate === today;
      } else if (rule.trigger_type === "before_days" && rule.days_before != null) {
        const triggerOn = addDays(eventDate, -rule.days_before);
        fireToday = triggerOn === today;
      }

      if (!fireToday) continue;

      let body: string;
      try {
        body = await resolveTemplateBody(rule.vendor_id, rule.template_id, undefined);
      } catch {
        continue;
      }

      const disp = await query<{ id: string }>(
        `INSERT INTO reminder_dispatch_log (rule_id, customer_id, dispatch_date)
         VALUES ($1, $2, $3)
         ON CONFLICT (rule_id, customer_id, dispatch_date) DO NOTHING
         RETURNING id`,
        [rule.id, c.id, today]
      );
      if (disp.rows.length === 0) continue;

      const log = await query<{ id: string }>(
        `INSERT INTO messages_log (vendor_id, customer_id, phone, body, template_id, status)
         VALUES ($1, $2, $3, $4, $5, 'queued')
         RETURNING id`,
        [rule.vendor_id, c.id, c.phone, body, rule.template_id]
      );
      await enqueueOutboundMessage(log.rows[0].id);
      queued++;
    }
  }

  return { scanned: rules.rows.length, queued };
}

