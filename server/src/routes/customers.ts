import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { queueWelcomeMessage } from "../services/customerAutomation.js";
import {
  advanceRechargeAfterPayment,
  parseISODate,
  shouldSkipRechargeReminder,
} from "../services/billingCycle.js";
import { applyCustomerBillingFields, getVendorBillingCycle } from "../services/customerBilling.js";

const router = Router();
router.use(requireVendor);

const tagsSchema = z.array(z.string()).default([]);
const customFieldsSchema = z.record(z.union([z.string(), z.number(), z.null()])).default({});

const customerBody = z.object({
  name: z.string().min(1).max(500),
  phone: z.string().min(5).max(32),
  joining_date: z.string().optional().nullable(),
  tags: tagsSchema,
  custom_fields: customFieldsSchema,
});

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

const customerSelect = `id, name, phone, tags, custom_fields, joining_date, recharge_date, rent_paid_until, created_at, updated_at`;

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

    const sql = `SELECT ${customerSelect}
                 FROM customers WHERE ${conditions.join(" AND ")}
                 ORDER BY updated_at DESC`;

    const r = await query(sql, params);
    const customers = r.rows.map((row: Record<string, unknown>) => {
      const recharge = row.recharge_date ? String(row.recharge_date).slice(0, 10) : null;
      const paidUntil = row.rent_paid_until ? String(row.rent_paid_until).slice(0, 10) : null;
      return {
        ...row,
        rent_current_period_paid:
          !!recharge &&
          !!paidUntil &&
          shouldSkipRechargeReminder({ eventDate: recharge, rentPaidUntil: paidUntil }),
      };
    });
    res.json({ customers });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const r = await query(`SELECT ${customerSelect} FROM customers WHERE vendor_id = $1 AND id = $2`, [
    vendorId,
    req.params.id,
  ]);
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

    const billing = await applyCustomerBillingFields(vendorId, body.joining_date, body.custom_fields);
    if (!billing.joining_date) {
      res.status(400).json({ error: "joining_date is required (YYYY-MM-DD)" });
      return;
    }

    const r = await query<{ id: string }>(
      `INSERT INTO customers (vendor_id, name, phone, tags, custom_fields, joining_date, recharge_date)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
       RETURNING id`,
      [
        vendorId,
        body.name,
        phone,
        JSON.stringify(body.tags),
        JSON.stringify(billing.custom_fields),
        billing.joining_date,
        billing.recharge_date,
      ]
    );
    const customerId = r.rows[0].id;
    void queueWelcomeMessage(vendorId, customerId).catch((err) => {
      console.error("[customers] welcome message failed", err);
    });
    res.status(201).json({ id: customerId, recharge_date: billing.recharge_date });
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
  try {
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

    if (body.joining_date !== undefined || body.custom_fields !== undefined) {
      const cur = await query<{ custom_fields: Record<string, unknown>; joining_date: string | null }>(
        `SELECT custom_fields, joining_date FROM customers WHERE vendor_id = $1 AND id = $2`,
        [vendorId, req.params.id]
      );
      if (cur.rows.length === 0) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      const mergedCustom = {
        ...(cur.rows[0].custom_fields ?? {}),
        ...(body.custom_fields ?? {}),
      };
      const billing = await applyCustomerBillingFields(
        vendorId,
        body.joining_date ?? cur.rows[0].joining_date,
        mergedCustom
      );
      updates.push(`joining_date = $${i++}`);
      params.push(billing.joining_date);
      updates.push(`recharge_date = $${i++}`);
      params.push(billing.recharge_date);
      updates.push(`custom_fields = $${i++}::jsonb`);
      params.push(JSON.stringify(billing.custom_fields));
    } else if (body.custom_fields !== undefined) {
      updates.push(`custom_fields = $${i++}::jsonb`);
      params.push(JSON.stringify(body.custom_fields));
    }

    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
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
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Mark current billing period rent as received; advance next due date and stop reminders until then. */
router.post("/:id/mark-rent-paid", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const customerId = String(req.params.id);

    const cur = await query<{ recharge_date: string | null }>(
      `SELECT recharge_date FROM customers WHERE vendor_id = $1 AND id = $2`,
      [vendorId, customerId]
    );
    if (cur.rows.length === 0) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const currentDue = parseISODate(cur.rows[0].recharge_date);
    if (!currentDue) {
      res.status(400).json({ error: "Customer has no recharge due date; set joining date first." });
      return;
    }

    const cycle = await getVendorBillingCycle(vendorId);
    const advanced = advanceRechargeAfterPayment(currentDue, cycle);

    const c = await query<{ custom_fields: Record<string, unknown> }>(
      `SELECT custom_fields FROM customers WHERE id = $1`,
      [customerId]
    );
    const custom = {
      ...(c.rows[0]?.custom_fields ?? {}),
      recharge_date: advanced.next_recharge_date,
      last_rent_paid_on: new Date().toISOString().slice(0, 10),
    };

    await query(
      `UPDATE customers SET rent_paid_until = $2, recharge_date = $3, custom_fields = $4::jsonb, updated_at = NOW()
       WHERE vendor_id = $1 AND id = $5`,
      [vendorId, advanced.rent_paid_until, advanced.next_recharge_date, JSON.stringify(custom), customerId]
    );

    res.json({
      ok: true,
      rent_paid_until: advanced.rent_paid_until,
      next_recharge_date: advanced.next_recharge_date,
    });
  } catch (e) {
    next(e);
  }
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
