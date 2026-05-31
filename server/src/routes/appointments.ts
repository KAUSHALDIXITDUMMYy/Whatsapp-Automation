import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { notifyVisitRescheduled } from "../services/customerNotify.js";

const router = Router();
router.use(requireVendor);

router.get("/", async (req: AuthedVendorRequest, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "scheduled";
  const r = await query(
    `SELECT a.id, a.appointment_date, a.appointment_time, a.status, a.notes, a.created_at,
            c.id AS customer_id, c.name AS customer_name, c.phone AS customer_phone
     FROM technician_appointments a
     JOIN customers c ON c.id = a.customer_id
     WHERE a.vendor_id = $1 AND ($2::text = 'all' OR a.status = $2)
     ORDER BY a.appointment_date ASC, a.appointment_time ASC
     LIMIT 200`,
    [req.vendorId, status]
  );
  res.json({ appointments: r.rows });
});

router.patch("/:id", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["scheduled", "completed", "cancelled"]).optional(),
        notes: z.string().max(2000).nullable().optional(),
        appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        appointment_time: z.string().min(1).max(16).optional(),
        notify_customer: z.boolean().optional(),
      })
      .parse(req.body);

    const cur = await query<{
      id: string;
      appointment_date: string;
      appointment_time: string;
      status: string;
      customer_id: string;
      customer_phone: string;
    }>(
      `SELECT a.id, a.appointment_date, a.appointment_time, a.status,
              c.id AS customer_id, c.phone AS customer_phone
       FROM technician_appointments a
       JOIN customers c ON c.id = a.customer_id
       WHERE a.vendor_id = $1 AND a.id = $2`,
      [req.vendorId, req.params.id]
    );
    if (cur.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = cur.rows[0];
    const oldDate = String(row.appointment_date).slice(0, 10);
    const oldTime = row.appointment_time;

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
    if (body.appointment_date !== undefined) {
      updates.push(`appointment_date = $${i++}`);
      params.push(body.appointment_date);
    }
    if (body.appointment_time !== undefined) {
      updates.push(`appointment_time = $${i++}`);
      params.push(body.appointment_time);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    params.push(req.vendorId, req.params.id);
    await query(
      `UPDATE technician_appointments SET ${updates.join(", ")}
       WHERE vendor_id = $${i++} AND id = $${i}`,
      params
    );

    const newDate = body.appointment_date ?? oldDate;
    const newTime = body.appointment_time ?? oldTime;
    const rescheduled =
      row.status === "scheduled" &&
      (newDate !== oldDate || newTime !== oldTime) &&
      body.notify_customer !== false;

    if (rescheduled) {
      void notifyVisitRescheduled({
        vendorId: req.vendorId!,
        customerId: row.customer_id,
        phone: row.customer_phone,
        oldDate,
        oldTime,
        newDate,
        newTime,
      });
    }

    res.json({ ok: true, notified: rescheduled });
  } catch (e) {
    next(e);
  }
});

export default router;
