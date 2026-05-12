import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireVendor);

const tagsSchema = z.array(z.string()).default([]);
const customFieldsSchema = z.record(z.union([z.string(), z.number(), z.null()])).default({});

const customerBody = z.object({
  name: z.string().min(1).max(500),
  phone: z.string().min(5).max(32),
  tags: tagsSchema,
  custom_fields: customFieldsSchema,
});

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

router.get("/", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
    const tagsParam =
      typeof req.query.tags === "string" ? req.query.tags.split(",").filter(Boolean) : [];
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const conditions: string[] = ["vendor_id = $1"];
    const params: unknown[] = [vendorId];
    let i = 2;

    if (tag) {
      conditions.push(`tags @> $${i}::jsonb`);
      params.push(JSON.stringify([tag]));
      i++;
    }
    if (tagsParam.length > 0) {
      conditions.push(`tags @> $${i}::jsonb`);
      params.push(JSON.stringify(tagsParam));
      i++;
    }
    if (search) {
      conditions.push(`(name ILIKE $${i} OR phone ILIKE $${i + 1})`);
      params.push(`%${search}%`, `%${search}%`);
      i += 2;
    }

    const customFilterPrefix = "cf_";
    for (const [key, value] of Object.entries(req.query)) {
      if (!key.startsWith(customFilterPrefix)) continue;
      const fieldKey = key.slice(customFilterPrefix.length);
      if (!fieldKey || typeof value !== "string") continue;
      conditions.push(`custom_fields @> $${i}::jsonb`);
      params.push(JSON.stringify({ [fieldKey]: value }));
      i++;
    }

    const sql = `SELECT id, name, phone, tags, custom_fields, created_at, updated_at
                 FROM customers WHERE ${conditions.join(" AND ")}
                 ORDER BY updated_at DESC`;

    const r = await query(sql, params);
    res.json({ customers: r.rows });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const r = await query(
    `SELECT id, name, phone, tags, custom_fields, created_at, updated_at
     FROM customers WHERE vendor_id = $1 AND id = $2`,
    [vendorId, req.params.id]
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json(r.rows[0]);
});

router.post("/", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const body = customerBody.parse(req.body);
    const phone = normalizePhone(body.phone);
    const r = await query<{ id: string }>(
      `INSERT INTO customers (vendor_id, name, phone, tags, custom_fields)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING id`,
      [vendorId, body.name, phone, JSON.stringify(body.tags), JSON.stringify(body.custom_fields)]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(409).json({ error: "Duplicate phone for this vendor" });
      return;
    }
    throw e;
  }
});

router.patch("/:id", async (req: AuthedVendorRequest, res, next) => {
  const vendorId = req.vendorId!;
  const body = customerBody.partial().parse(req.body);
  const updates: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (body.name !== undefined) {
    updates.push(`name = $${i++}`);
    params.push(body.name);
  }
  if (body.phone !== undefined) {
    updates.push(`phone = $${i++}`);
    params.push(normalizePhone(body.phone));
  }
  if (body.tags !== undefined) {
    updates.push(`tags = $${i++}::jsonb`);
    params.push(JSON.stringify(body.tags));
  }
  if (body.custom_fields !== undefined) {
    updates.push(`custom_fields = $${i++}::jsonb`);
    params.push(JSON.stringify(body.custom_fields));
  }
  if (updates.length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  updates.push(`updated_at = NOW()`);
  params.push(vendorId, req.params.id);

  const r = await query(
    `UPDATE customers SET ${updates.join(", ")}
     WHERE vendor_id = $${i++} AND id = $${i}
     RETURNING id`,
    params
  );
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.json({ ok: true });
});

router.delete("/:id", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const r = await query(`DELETE FROM customers WHERE vendor_id = $1 AND id = $2 RETURNING id`, [
    vendorId,
    req.params.id,
  ]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  res.status(204).send();
});

router.post("/:id/tags", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const schema = z.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() });
    const { add = [], remove = [] } = schema.parse(req.body);

    const cur = await query<{ tags: unknown }>(
      `SELECT tags FROM customers WHERE vendor_id = $1 AND id = $2`,
      [vendorId, req.params.id]
    );
    if (cur.rows.length === 0) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    let list = new Set<string>((cur.rows[0].tags as string[]) ?? []);
    remove.forEach((t) => list.delete(t));
    add.forEach((t) => list.add(t));

    await query(`UPDATE customers SET tags = $1::jsonb, updated_at = NOW() WHERE vendor_id = $2 AND id = $3`, [
      JSON.stringify([...list]),
      vendorId,
      req.params.id,
    ]);
    res.json({ tags: [...list] });
  } catch (e) {
    next(e);
  }
});

export default router;
