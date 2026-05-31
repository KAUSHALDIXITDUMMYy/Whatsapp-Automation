import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { computeRechargeDueDate, parseBillingCycle } from "../services/billingCycle.js";

const router = Router();
router.use(requireVendor);

router.get("/me", async (req: AuthedVendorRequest, res) => {
  const r = await query<{
    id: string;
    company_name: string;
    email: string;
    created_at: Date;
    subscription_tier: string;
    subscription_expires_at: Date | null;
    whatsapp_sender: string | null;
    welcome_on_create_enabled: boolean;
    appointment_slot_times: unknown;
    appointment_days_ahead: number;
    whatsapp_menu_greeting: string | null;
    billing_cycle: string;
  }>(
    `SELECT id, company_name, email, created_at, subscription_tier, subscription_expires_at, whatsapp_sender,
            welcome_on_create_enabled, appointment_slot_times, appointment_days_ahead,
            whatsapp_menu_greeting, billing_cycle
     FROM vendors WHERE id = $1`,
    [req.vendorId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const row = r.rows[0];
  res.json({
    ...row,
    platform_templates: {
      welcome: config.metaTemplateWelcome,
      recharge: config.metaTemplateRecharge,
    },
  });
});

/** Messages from platform admins; shown on the vendor dashboard until dismissed. */
router.get("/dashboard-reminders", async (req: AuthedVendorRequest, res, next) => {
  try {
    const onlyUnread = req.query.unread !== "false";
    const r = await query<{ id: string; message: string; created_at: Date; read_at: Date | null }>(
      onlyUnread
        ? `SELECT id, message, created_at, read_at
           FROM vendor_dashboard_reminders
           WHERE vendor_id = $1 AND read_at IS NULL
           ORDER BY created_at DESC
           LIMIT 100`
        : `SELECT id, message, created_at, read_at
           FROM vendor_dashboard_reminders
           WHERE vendor_id = $1
           ORDER BY created_at DESC
           LIMIT 50`,
      [req.vendorId]
    );
    res.json({ reminders: r.rows });
  } catch (e) {
    next(e);
  }
});

router.patch("/dashboard-reminders/:id/read", async (req: AuthedVendorRequest, res, next) => {
  try {
    const r = await query(
      `UPDATE vendor_dashboard_reminders
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND vendor_id = $2
       RETURNING id`,
      [req.params.id, req.vendorId]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.patch("/me", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = z
      .object({
        whatsapp_sender: z.union([z.string().max(64), z.literal("")]).optional(),
        welcome_on_create_enabled: z.boolean().optional(),
        appointment_slot_times: z.array(z.string().min(1).max(16)).optional(),
        appointment_days_ahead: z.number().int().min(1).max(30).optional(),
        whatsapp_menu_greeting: z.string().max(500).nullable().optional(),
        billing_cycle: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).optional(),
      })
      .parse(req.body);

    const v = await query<{ subscription_tier: string }>(
      `SELECT subscription_tier FROM vendors WHERE id = $1`,
      [req.vendorId]
    );
    if (v.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (body.whatsapp_sender !== undefined && v.rows[0].subscription_tier !== "pro") {
      res.status(403).json({
        error: "Only Pro accounts can set a dedicated WhatsApp Business sender number.",
      });
      return;
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (body.whatsapp_sender !== undefined) {
      updates.push(`whatsapp_sender = $${i++}`);
      params.push(body.whatsapp_sender === "" ? null : body.whatsapp_sender.trim());
    }
    if (body.welcome_on_create_enabled !== undefined) {
      updates.push(`welcome_on_create_enabled = $${i++}`);
      params.push(body.welcome_on_create_enabled);
    }
    if (body.appointment_slot_times !== undefined) {
      updates.push(`appointment_slot_times = $${i++}::jsonb`);
      params.push(JSON.stringify(body.appointment_slot_times));
    }
    if (body.appointment_days_ahead !== undefined) {
      updates.push(`appointment_days_ahead = $${i++}`);
      params.push(body.appointment_days_ahead);
    }
    if (body.whatsapp_menu_greeting !== undefined) {
      updates.push(`whatsapp_menu_greeting = $${i++}`);
      params.push(body.whatsapp_menu_greeting);
    }
    if (body.billing_cycle !== undefined) {
      updates.push(`billing_cycle = $${i++}`);
      params.push(body.billing_cycle);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    params.push(req.vendorId);
    await query(`UPDATE vendors SET ${updates.join(", ")} WHERE id = $${i}`, params);

    if (body.billing_cycle !== undefined) {
      const cycle = parseBillingCycle(body.billing_cycle);
      const subs = await query<{ id: string; joining_date: string; custom_fields: Record<string, unknown> }>(
        `SELECT id, joining_date, custom_fields FROM customers
         WHERE vendor_id = $1 AND joining_date IS NOT NULL`,
        [req.vendorId]
      );
      for (const c of subs.rows) {
        const joining = String(c.joining_date).slice(0, 10);
        const recharge = computeRechargeDueDate(joining, cycle);
        const custom = { ...c.custom_fields, joining_date: joining, recharge_date: recharge };
        await query(
          `UPDATE customers SET recharge_date = $2, custom_fields = $3::jsonb, updated_at = NOW() WHERE id = $1`,
          [c.id, recharge, JSON.stringify(custom)]
        );
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
