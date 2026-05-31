import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { enqueueOutboundMessage } from "../services/messageJobs.js";
import {
  assertSubscriptionActive,
  getVendorSubscription,
} from "../services/subscription.js";

const router = Router();
router.use(requireVendor);

router.get("/conversations", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const chatOnly = req.query.chat_only === "true";

  const r = await query(
    chatOnly
      ? `WITH last_msg AS (
           SELECT DISTINCT ON (customer_id)
             customer_id, body, direction, status, created_at
           FROM messages_log
           WHERE vendor_id = $1 AND customer_id IS NOT NULL
           ORDER BY customer_id, created_at DESC
         )
         SELECT c.id, c.name, c.phone,
                l.body AS last_message, l.direction AS last_direction,
                l.status AS last_status, l.created_at AS last_at
         FROM customers c
         INNER JOIN last_msg l ON l.customer_id = c.id
         WHERE c.vendor_id = $1 AND c.tags @> '["whatsapp_chat_active"]'::jsonb
         ORDER BY l.created_at DESC`
      : `WITH last_msg AS (
           SELECT DISTINCT ON (customer_id)
             customer_id, body, direction, status, created_at
           FROM messages_log
           WHERE vendor_id = $1 AND customer_id IS NOT NULL
           ORDER BY customer_id, created_at DESC
         )
         SELECT c.id, c.name, c.phone,
                l.body AS last_message, l.direction AS last_direction,
                l.status AS last_status, l.created_at AS last_at
         FROM customers c
         INNER JOIN last_msg l ON l.customer_id = c.id
         WHERE c.vendor_id = $1
         ORDER BY l.created_at DESC`,
    [vendorId]
  );
  res.json({ conversations: r.rows });
});

router.get("/conversations/:customerId/messages", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const customerId = String(req.params.customerId);
  const c = await query(`SELECT id FROM customers WHERE vendor_id = $1 AND id = $2`, [
    vendorId,
    customerId,
  ]);
  if (c.rows.length === 0) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  const r = await query(
    `SELECT id, direction, body, status, provider_message_id, provider_error, created_at
     FROM messages_log
     WHERE vendor_id = $1 AND customer_id = $2
     ORDER BY created_at ASC
     LIMIT 300`,
    [vendorId, customerId]
  );
  res.json({ messages: r.rows });
});

router.post("/reply", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const body = z
      .object({
        customer_id: z.string().uuid(),
        body: z.string().min(1).max(4096),
      })
      .parse(req.body);

    const sub = await getVendorSubscription(vendorId);
    if (!sub) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    assertSubscriptionActive(sub);

    const c = await query<{ phone: string }>(
      `SELECT phone FROM customers WHERE vendor_id = $1 AND id = $2`,
      [vendorId, body.customer_id]
    );
    if (c.rows.length === 0) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const log = await query<{ id: string }>(
      `INSERT INTO messages_log (vendor_id, customer_id, phone, body, status, direction)
       VALUES ($1, $2, $3, $4, 'queued', 'outbound')
       RETURNING id`,
      [vendorId, body.customer_id, c.rows[0].phone, body.body.trim()]
    );
    await enqueueOutboundMessage(log.rows[0].id);
    res.status(202).json({ ok: true, log_id: log.rows[0].id });
  } catch (e) {
    next(e);
  }
});

export default router;
