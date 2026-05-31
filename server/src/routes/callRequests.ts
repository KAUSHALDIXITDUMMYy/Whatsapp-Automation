import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireVendor);

router.get("/", async (req: AuthedVendorRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const r = await query(
    `SELECT r.id, r.preferred_date, r.preferred_time, r.status, r.notes, r.created_at,
            c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone
     FROM technician_call_requests r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.vendor_id = $1 AND ($2::text = 'all' OR r.status = $2)
     ORDER BY r.preferred_date ASC, r.preferred_time ASC
     LIMIT 200`,
    [req.vendorId, status]
  );
  res.json({ call_requests: r.rows });
});

router.patch("/:id", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["pending", "called", "cancelled"]).optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(req.body);

    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.status !== undefined) {
      updates.push(`status = $${i++}`);
      params.push(body.status);
    }
    if (body.notes !== undefined) {
      updates.push(`notes = $${i++}`);
      params.push(body.notes);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    params.push(req.vendorId, req.params.id);
    const r = await query(
      `UPDATE technician_call_requests SET ${updates.join(", ")}
       WHERE vendor_id = $${i++} AND id = $${i}
       RETURNING id`,
      params
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

export default router;
