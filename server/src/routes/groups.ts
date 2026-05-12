import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { buildCustomerWhereFromFilters } from "../services/customerFilters.js";

const router = Router();
router.use(requireVendor);

const filtersSchema = z.object({
  tags: z.array(z.string()).optional(),
  tag_mode: z.enum(["any", "all"]).optional(),
  custom_fields: z.record(z.string()).optional(),
});

const groupBody = z.object({
  name: z.string().min(1).max(255),
  filters: filtersSchema,
});

router.get("/", async (req: AuthedVendorRequest, res) => {
  const r = await query(
    `SELECT id, name, filters, created_at FROM dynamic_groups WHERE vendor_id = $1 ORDER BY name`,
    [req.vendorId]
  );
  res.json({ groups: r.rows });
});

router.post("/", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = groupBody.parse(req.body);
    const r = await query<{ id: string }>(
      `INSERT INTO dynamic_groups (vendor_id, name, filters) VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [req.vendorId, body.name, JSON.stringify(body.filters)]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", async (req: AuthedVendorRequest, res, next) => {
  const body = groupBody.partial().parse(req.body);
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (body.name !== undefined) {
    updates.push(`name = $${i++}`);
    params.push(body.name);
  }
  if (body.filters !== undefined) {
    updates.push(`filters = $${i++}::jsonb`);
    params.push(JSON.stringify(body.filters));
  }
  if (updates.length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }
  params.push(req.vendorId, req.params.id);
  const r = await query(
    `UPDATE dynamic_groups SET ${updates.join(", ")} WHERE vendor_id = $${i++} AND id = $${i} RETURNING id`,
    params
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req: AuthedVendorRequest, res) => {
  const r = await query(`DELETE FROM dynamic_groups WHERE vendor_id = $1 AND id = $2 RETURNING id`, [
    req.vendorId,
    req.params.id,
  ]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

router.get("/:id/preview", async (req: AuthedVendorRequest, res, next) => {
  try {
    const g = await query<{ filters: Record<string, unknown> }>(
      `SELECT filters FROM dynamic_groups WHERE vendor_id = $1 AND id = $2`,
      [req.vendorId, req.params.id]
    );
    if (g.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { whereClause, params } = buildCustomerWhereFromFilters(req.vendorId!, g.rows[0].filters);
    const cnt = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM customers WHERE ${whereClause}`,
      params
    );
    res.json({ count: parseInt(cnt.rows[0].n, 10) });
  } catch (e) {
    next(e);
  }
});

export default router;
