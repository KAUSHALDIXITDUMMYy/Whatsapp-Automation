import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireVendor);

const fieldSchema = z.object({
  field_key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1).max(255),
  field_type: z.enum(["date", "text", "number"]),
  sort_order: z.number().int().optional(),
});

router.get("/", async (req: AuthedVendorRequest, res) => {
  const r = await query(
    `SELECT id, field_key, label, field_type, sort_order, created_at
     FROM custom_field_definitions WHERE vendor_id = $1 ORDER BY sort_order, label`,
    [req.vendorId]
  );
  res.json({ fields: r.rows });
});

router.post("/", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = fieldSchema.parse(req.body);
    const r = await query<{ id: string }>(
      `INSERT INTO custom_field_definitions (vendor_id, field_key, label, field_type, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        req.vendorId,
        body.field_key.toLowerCase(),
        body.label,
        body.field_type,
        body.sort_order ?? 0,
      ]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(409).json({ error: "Field key already exists" });
      return;
    }
    next(e);
  }
});

router.patch("/:id", async (req: AuthedVendorRequest, res) => {
  const patchSchema = fieldSchema.partial().omit({ field_key: true });
  const body = patchSchema.parse(req.body);
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (body.label !== undefined) {
    updates.push(`label = $${i++}`);
    params.push(body.label);
  }
  if (body.field_type !== undefined) {
    updates.push(`field_type = $${i++}`);
    params.push(body.field_type);
  }
  if (body.sort_order !== undefined) {
    updates.push(`sort_order = $${i++}`);
    params.push(body.sort_order);
  }
  if (updates.length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  params.push(req.vendorId, req.params.id);
  const r = await query(
    `UPDATE custom_field_definitions SET ${updates.join(", ")}
     WHERE vendor_id = $${i++} AND id = $${i}
     RETURNING id`,
    params
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req: AuthedVendorRequest, res) => {
  const r = await query(`DELETE FROM custom_field_definitions WHERE vendor_id = $1 AND id = $2 RETURNING id`, [
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
