import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";

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
  }>(
    `SELECT id, company_name, email, created_at, subscription_tier, subscription_expires_at, whatsapp_sender
     FROM vendors WHERE id = $1`,
    [req.vendorId]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const row = r.rows[0];
  const cnt = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM message_templates WHERE vendor_id = $1`,
    [req.vendorId]
  );
  const templateCount = parseInt(cnt.rows[0].n, 10);
  res.json({
    ...row,
    limits: {
      basic_max_templates: config.basicMaxTemplates,
      template_count: templateCount,
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
    if (v.rows[0].subscription_tier !== "pro") {
      res.status(403).json({
        error: "Only Pro accounts can set a dedicated WhatsApp Business sender number.",
      });
      return;
    }

    if (body.whatsapp_sender === undefined) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const normalized = body.whatsapp_sender === "" ? null : body.whatsapp_sender.trim();
    await query(`UPDATE vendors SET whatsapp_sender = $1 WHERE id = $2`, [normalized, req.vendorId]);
    res.json({ ok: true, whatsapp_sender: normalized });
  } catch (e) {
    next(e);
  }
});

export default router;
