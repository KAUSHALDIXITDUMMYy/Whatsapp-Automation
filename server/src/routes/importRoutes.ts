import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { parseCsvWithDetectedHeader } from "../services/csvHeader.js";
import { queueWelcomeMessage } from "../services/customerAutomation.js";
import { applyCustomerBillingFields } from "../services/customerBilling.js";
import {
  autoMapSubscriberHeaders,
  extractSubscriberRow,
  getSheetFormatForApi,
} from "../services/subscriberSheet.js";

const router = Router();
router.use(requireVendor);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const mappingSchema = z.record(z.string());

router.get("/sheet-format", (_req: AuthedVendorRequest, res) => {
  res.json(getSheetFormatForApi());
});

router.get("/templates", async (req: AuthedVendorRequest, res) => {
  const r = await query(
    `SELECT id, name, mapping, created_at FROM csv_mapping_templates WHERE vendor_id = $1 ORDER BY name`,
    [req.vendorId]
  );
  res.json({ templates: r.rows });
});

router.post("/templates", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(255),
        mapping: mappingSchema,
      })
      .parse(req.body);
    const r = await query<{ id: string }>(
      `INSERT INTO csv_mapping_templates (vendor_id, name, mapping) VALUES ($1, $2, $3::jsonb) RETURNING id`,
      [req.vendorId, body.name, JSON.stringify(body.mapping)]
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.delete("/templates/:id", async (req: AuthedVendorRequest, res) => {
  const r = await query(`DELETE FROM csv_mapping_templates WHERE vendor_id = $1 AND id = $2 RETURNING id`, [
    req.vendorId,
    req.params.id,
  ]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

router.post("/preview", upload.single("file"), async (req: AuthedVendorRequest, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "file required" });
      return;
    }
    const text = req.file.buffer.toString("utf-8");
    const { headers, rows, headerRowNumberDisplay } = parseCsvWithDetectedHeader(text);
    const suggested_mapping = autoMapSubscriberHeaders(headers);
    res.json({
      headers,
      header_row_number: headerRowNumberDisplay,
      sample_rows: rows.slice(0, 5),
      suggested_mapping,
      sheet_format: getSheetFormatForApi(),
    });
  } catch (e) {
    next(e);
  }
});

router.post("/", upload.single("file"), async (req: AuthedVendorRequest, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "file required" });
      return;
    }
    let mapping: Record<string, string>;
    try {
      mapping = mappingSchema.parse(JSON.parse(String(req.body.mapping ?? "{}")));
    } catch {
      res.status(400).json({ error: "Invalid mapping JSON" });
      return;
    }

    const text = req.file.buffer.toString("utf-8");
    const { rows } = parseCsvWithDetectedHeader(text);
    const vendorId = req.vendorId!;

    let imported = 0;
    let skipped = 0;
    let missingJoinDate = 0;

    for (const row of rows) {
      const extracted = extractSubscriberRow(row, mapping);
      let { name, phone, joining_date, tags } = extracted;

      if (!phone) {
        skipped++;
        continue;
      }
      if (!name) name = phone;

      const billing = await applyCustomerBillingFields(vendorId, joining_date, {});
      if (!billing.joining_date) {
        missingJoinDate++;
        skipped++;
        continue;
      }

      const ins = await query<{ id?: string }>(
        `INSERT INTO customers (vendor_id, name, phone, tags, custom_fields, joining_date, recharge_date)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
         ON CONFLICT (vendor_id, phone) DO NOTHING
         RETURNING id`,
        [
          vendorId,
          name,
          phone,
          JSON.stringify(tags),
          JSON.stringify(billing.custom_fields),
          billing.joining_date,
          billing.recharge_date,
        ]
      );
      if (ins.rows.length > 0) {
        imported++;
        const newId = ins.rows[0].id;
        if (newId) {
          void queueWelcomeMessage(vendorId, newId).catch((err) => {
            console.error("[import] welcome message failed", err);
          });
        }
      } else skipped++;
    }

    res.json({ imported, skipped, missing_joining_date: missingJoinDate, total: rows.length });
  } catch (e) {
    next(e);
  }
});

export default router;
