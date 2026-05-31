import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAdmin, type AuthedAdminRequest } from "../middleware/auth.js";
import { hashPassword } from "../utils/password.js";

const router = Router();
router.use(requireAdmin);

router.get("/vendors", async (_req: AuthedAdminRequest, res) => {
  const r = await query(
    `SELECT v.id, v.company_name, v.email, v.created_at,
            v.subscription_tier, v.subscription_expires_at, v.whatsapp_sender,
            (SELECT COUNT(*)::int FROM customers c WHERE c.vendor_id = v.id) AS customer_count,
            (SELECT COUNT(*)::int FROM messages_log m WHERE m.vendor_id = v.id AND m.status = 'sent') AS messages_sent
     FROM vendors v
     ORDER BY v.created_at DESC`
  );
  res.json({ vendors: r.rows });
});

/** Subscriptions expiring within N days (or already expired if include_expired=true). */
router.get("/vendors/expiring", async (req: AuthedAdminRequest, res, next) => {
  try {
    const daysRaw = req.query.days;
    const days = Math.min(365, Math.max(1, parseInt(String(daysRaw ?? "14"), 10) || 14));
    const includeExpired = req.query.include_expired === "true";
    const r = await query(
      `SELECT v.id, v.company_name, v.email, v.created_at,
              v.subscription_tier, v.subscription_expires_at, v.whatsapp_sender,
              (SELECT COUNT(*)::int FROM customers c WHERE c.vendor_id = v.id) AS customer_count,
              (SELECT COUNT(*)::int FROM messages_log m WHERE m.vendor_id = v.id AND m.status = 'sent') AS messages_sent
       FROM vendors v
       WHERE v.subscription_expires_at IS NOT NULL
         AND (
           (v.subscription_expires_at >= NOW() AND v.subscription_expires_at <= NOW() + ($1::int * INTERVAL '1 day'))
           OR ($2::boolean = true AND v.subscription_expires_at < NOW())
         )
       ORDER BY v.subscription_expires_at ASC`,
      [days, includeExpired]
    );
    res.json({ vendors: r.rows, days, include_expired: includeExpired });
  } catch (e) {
    next(e);
  }
});

/** Single-vendor snapshot for admin dashboard view. */
router.get("/vendors/:id/summary", async (req: AuthedAdminRequest, res, next) => {
  try {
    const r = await query<{
      id: string;
      company_name: string;
      email: string;
      created_at: Date;
      subscription_tier: string;
      subscription_expires_at: Date | null;
      whatsapp_sender: string | null;
      customer_count: string;
      messages_sent: string;
      messages_failed: string;
      scheduled_visits: string;
    }>(
      `SELECT v.id, v.company_name, v.email, v.created_at,
              v.subscription_tier, v.subscription_expires_at, v.whatsapp_sender,
              (SELECT COUNT(*)::text FROM customers c WHERE c.vendor_id = v.id) AS customer_count,
              (SELECT COUNT(*)::text FROM messages_log m WHERE m.vendor_id = v.id AND m.status = 'sent') AS messages_sent,
              (SELECT COUNT(*)::text FROM messages_log m WHERE m.vendor_id = v.id AND m.status = 'failed') AS messages_failed,
              (SELECT COUNT(*)::text FROM technician_appointments a WHERE a.vendor_id = v.id AND a.status = 'scheduled') AS scheduled_visits
       FROM vendors v WHERE v.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    const row = r.rows[0];
    res.json({
      vendor: {
        ...row,
        customer_count: parseInt(row.customer_count, 10),
        messages_sent: parseInt(row.messages_sent, 10),
        messages_failed: parseInt(row.messages_failed, 10),
        scheduled_visits: parseInt(row.scheduled_visits, 10),
      },
    });
  } catch (e) {
    next(e);
  }
});

/** Push a message to the vendor's dashboard (visible until they dismiss it). */
router.post("/vendors/:id/dashboard-reminders", async (req: AuthedAdminRequest, res, next) => {
  try {
    const parsed = z.object({ message: z.string().min(1).max(8000) }).parse(req.body);
    const message = parsed.message.trim();
    if (!message) {
      res.status(400).json({ error: "message cannot be empty" });
      return;
    }
    const exists = await query(`SELECT 1 FROM vendors WHERE id = $1`, [req.params.id]);
    if (exists.rows.length === 0) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    const ins = await query<{ id: string; created_at: Date }>(
      `INSERT INTO vendor_dashboard_reminders (vendor_id, message)
       VALUES ($1, $2)
       RETURNING id, created_at`,
      [req.params.id, message]
    );
    res.status(201).json({ reminder: ins.rows[0] });
  } catch (e) {
    next(e);
  }
});

/** Set a new login password for the vendor (e.g. forgot password). Same hashing as registration. */
router.post("/vendors/:id/password", async (req: AuthedAdminRequest, res, next) => {
  try {
    const body = z.object({ password: z.string().min(8).max(128) }).parse(req.body);
    const pw = await hashPassword(body.password);
    const r = await query(`UPDATE vendors SET password_hash = $1 WHERE id = $2 RETURNING id`, [
      pw,
      req.params.id,
    ]);
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.patch("/vendors/:id", async (req: AuthedAdminRequest, res, next) => {
  try {
    const body = z
      .object({
        subscription_tier: z.enum(["basic", "pro"]).optional(),
        subscription_expires_at: z.union([z.string(), z.null()]).optional(),
        whatsapp_sender: z.union([z.string().max(64), z.null()]).optional(),
      })
      .parse(req.body);

    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;

    if (body.subscription_tier !== undefined) {
      updates.push(`subscription_tier = $${i++}`);
      params.push(body.subscription_tier);
    }
    if (body.subscription_expires_at !== undefined) {
      updates.push(`subscription_expires_at = $${i++}`);
      if (body.subscription_expires_at === null) {
        params.push(null);
      } else {
        const d = new Date(body.subscription_expires_at);
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "Invalid subscription_expires_at" });
          return;
        }
        params.push(d.toISOString());
      }
    }
    if (body.whatsapp_sender !== undefined) {
      updates.push(`whatsapp_sender = $${i++}`);
      params.push(body.whatsapp_sender);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    params.push(req.params.id);
    const idPlaceholder = params.length;
    const r = await query(
      `UPDATE vendors SET ${updates.join(", ")} WHERE id = $${idPlaceholder} RETURNING id`,
      params
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get("/stats", async (_req: AuthedAdminRequest, res) => {
  const v = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM vendors`);
  const m = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM messages_log WHERE status = 'sent'`);
  const f = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM messages_log WHERE status = 'failed'`);
  res.json({
    vendors: parseInt(v.rows[0].n, 10),
    messages_sent: parseInt(m.rows[0].n, 10),
    messages_failed: parseInt(f.rows[0].n, 10),
  });
});

export default router;
