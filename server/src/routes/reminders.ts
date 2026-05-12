import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireVendor);

const ruleBody = z.object({
  name: z.string().min(1).max(255),
  date_field_key: z.string().min(1).max(64),
  trigger_type: z.enum(["on_date", "before_days"]),
  days_before: z.number().int().min(0).nullable().optional(),
  template_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

router.get("/", async (req: AuthedVendorRequest, res) => {
  const r = await query(
    `SELECT r.id, r.name, r.date_field_key, r.trigger_type, r.days_before, r.template_id, r.is_active, r.created_at,
            t.name AS template_name
     FROM reminder_rules r
     LEFT JOIN message_templates t ON t.id = r.template_id
     WHERE r.vendor_id = $1
     ORDER BY r.name`,
    [req.vendorId]
  );
  res.json({ rules: r.rows });
});

router.post("/", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = ruleBody.parse(req.body);
    if (body.trigger_type === "before_days" && (body.days_before === undefined || body.days_before === null)) {
      res.status(400).json({ error: "days_before required for before_days trigger" });
      return;
    }
    if (body.trigger_type === "on_date") {
      (body as { days_before?: number | null }).days_before = null;
    }
    const r = await query<{ id: string }>(
      `INSERT INTO reminder_rules (vendor_id, name, date_field_key, trigger_type, days_before, template_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        req.vendorId,
        body.name,
        body.date_field_key,
        body.trigger_type,
        body.trigger_type === "before_days" ? body.days_before ?? 0 : null,
        body.template_id ?? null,
        body.is_active ?? true,
      ]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (err.message?.includes("chk_days_before")) {
      res.status(400).json({ error: "Invalid reminder rule constraints" });
      return;
    }
    next(e);
  }
});

router.patch("/:id", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = ruleBody.partial().parse(req.body);
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.name !== undefined) {
      updates.push(`name = $${i++}`);
      params.push(body.name);
    }
    if (body.date_field_key !== undefined) {
      updates.push(`date_field_key = $${i++}`);
      params.push(body.date_field_key);
    }
    if (body.trigger_type !== undefined) {
      updates.push(`trigger_type = $${i++}`);
      params.push(body.trigger_type);
    }
    if (body.days_before !== undefined) {
      updates.push(`days_before = $${i++}`);
      params.push(body.days_before);
    }
    if (body.template_id !== undefined) {
      updates.push(`template_id = $${i++}`);
      params.push(body.template_id);
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${i++}`);
      params.push(body.is_active);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    params.push(req.vendorId, req.params.id);
    const r = await query(
      `UPDATE reminder_rules SET ${updates.join(", ")} WHERE vendor_id = $${i++} AND id = $${i} RETURNING id`,
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

router.delete("/:id", async (req: AuthedVendorRequest, res) => {
  const r = await query(`DELETE FROM reminder_rules WHERE vendor_id = $1 AND id = $2 RETURNING id`, [
    req.vendorId,
    req.params.id,
  ]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

export default router;
