import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAdmin, type AuthedAdminRequest } from "../middleware/auth.js";
import {
  assignCatalogSubmissionToVendor,
  materializeVendorTemplateIfEligible,
  persistWhatsAppApprovalPoll,
} from "../services/templateSubmissions.js";
import type { SubscriptionTier } from "../services/subscription.js";
import {
  createContentAndSubmitWhatsAppApproval,
  fetchWhatsAppApprovalFromTwilio,
  normalizeWhatsAppTemplateName,
} from "../services/twilioWhatsAppTemplateSubmit.js";
import { normalizeTemplateSubmissionInput } from "../services/twilioContentTypes.js";
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
      template_count: string;
    }>(
      `SELECT v.id, v.company_name, v.email, v.created_at,
              v.subscription_tier, v.subscription_expires_at, v.whatsapp_sender,
              (SELECT COUNT(*)::text FROM customers c WHERE c.vendor_id = v.id) AS customer_count,
              (SELECT COUNT(*)::text FROM messages_log m WHERE m.vendor_id = v.id AND m.status = 'sent') AS messages_sent,
              (SELECT COUNT(*)::text FROM messages_log m WHERE m.vendor_id = v.id AND m.status = 'failed') AS messages_failed,
              (SELECT COUNT(*)::text FROM message_templates t WHERE t.vendor_id = v.id) AS template_count
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
        template_count: parseInt(row.template_count, 10),
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

router.get("/template-submissions", async (_req: AuthedAdminRequest, res) => {
  const r = await query(
    `SELECT s.id, s.vendor_id, s.name, s.body, s.twilio_types_key, s.types_payload, s.external_template_id,
            s.twilio_content_sid, s.whatsapp_template_name, s.whatsapp_category,
            s.whatsapp_approval_status, s.whatsapp_rejection_reason,
            s.admin_status, s.rejection_reason,
            s.resubmits_id, s.created_at, s.updated_at,
            v.company_name AS vendor_company_name, v.email AS vendor_email,
            v.subscription_tier AS vendor_subscription_tier
     FROM template_submissions s
     LEFT JOIN vendors v ON s.vendor_id = v.id
     ORDER BY s.created_at DESC`
  );
  res.json({ submissions: r.rows });
});

router.post("/template-submissions", async (req: AuthedAdminRequest, res, next) => {
  try {
    const raw = z
      .object({
        name: z.string().min(1).max(255),
        body: z.string().optional(),
        twilio_types_key: z.string().optional(),
        types_payload: z.unknown().optional(),
      })
      .parse(req.body);

    let normalized: ReturnType<typeof normalizeTemplateSubmissionInput>;
    try {
      normalized = normalizeTemplateSubmissionInput(raw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid template payload";
      res.status(400).json({ error: msg });
      return;
    }

    const ins = await query<{ id: string }>(
      `INSERT INTO template_submissions (vendor_id, name, body, admin_status, twilio_types_key, types_payload)
       VALUES (NULL, $1, $2, 'none', $3, $4::jsonb)
       RETURNING id`,
      [raw.name, normalized.body, normalized.twilio_types_key, JSON.stringify(normalized.types_payload)]
    );
    res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    next(e);
  }
});

/** CRM-only decision (separate from WhatsApp/Meta approval). */
router.patch("/template-submissions/:id", async (req: AuthedAdminRequest, res, next) => {
  try {
    const submissionId = String(req.params.id);
    const parsed = z
      .object({
        admin_status: z.enum(["approved", "rejected"]).optional(),
        status: z.enum(["approved", "rejected"]).optional(),
        rejection_reason: z.string().optional(),
        external_template_id: z.union([z.string(), z.null()]).optional(),
      })
      .parse(req.body);

    const decision = parsed.admin_status ?? parsed.status;
    if (!decision) {
      res.status(400).json({ error: "Provide admin_status or status (approved | rejected)." });
      return;
    }

    const cur = await query<{
      id: string;
      vendor_id: string | null;
      admin_status: string;
    }>(`SELECT id, vendor_id, admin_status FROM template_submissions WHERE id = $1`, [submissionId]);
    if (cur.rows.length === 0) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    if (!["pending", "none"].includes(cur.rows[0].admin_status)) {
      res.status(400).json({ error: "Admin CRM decision already recorded for this submission." });
      return;
    }

    if (decision === "rejected") {
      await query(
        `UPDATE template_submissions
         SET admin_status = 'rejected', rejection_reason = $2, updated_at = NOW()
         WHERE id = $1`,
        [submissionId, parsed.rejection_reason ?? ""]
      );
      res.json({ ok: true });
      return;
    }

    if (parsed.external_template_id !== undefined) {
      await query(
        `UPDATE template_submissions SET admin_status = 'approved', external_template_id = $2, updated_at = NOW() WHERE id = $1`,
        [submissionId, parsed.external_template_id]
      );
    } else {
      await query(`UPDATE template_submissions SET admin_status = 'approved', updated_at = NOW() WHERE id = $1`, [
        submissionId,
      ]);
    }

    if (cur.rows[0].vendor_id) {
      await materializeVendorTemplateIfEligible(submissionId);
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/** Create Twilio Content + submit to WhatsApp for Meta review (no manual Console step). */
router.post("/template-submissions/:id/submit-whatsapp", async (req: AuthedAdminRequest, res, next) => {
  try {
    const submissionId = String(req.params.id);
    const body = z
      .object({
        category: z.enum(["UTILITY", "MARKETING"]),
        whatsapp_template_name: z.string().min(1).max(512).optional(),
        language: z.string().min(2).max(16).optional(),
      })
      .parse(req.body);

    const cur = await query<{
      id: string;
      name: string;
      body: string;
      vendor_id: string | null;
      twilio_content_sid: string | null;
      twilio_types_key: string | null;
      types_payload: unknown;
    }>(
      `SELECT id, name, body, vendor_id, twilio_content_sid, twilio_types_key, types_payload
       FROM template_submissions WHERE id = $1`,
      [submissionId]
    );
    if (cur.rows.length === 0) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    const row = cur.rows[0];
    if (row.twilio_content_sid) {
      res.status(400).json({
        error: "Already submitted to Twilio. Use “Sync WhatsApp status” to refresh Meta approval state.",
      });
      return;
    }

    const waName = body.whatsapp_template_name ?? row.name;
    const typesPayload =
      row.types_payload && typeof row.types_payload === "object"
        ? row.types_payload
        : ({ body: row.body } as Record<string, unknown>);
    const twilioTypesKey = row.twilio_types_key?.trim() || "twilio/text";

    const { contentSid, approvalStatus } = await createContentAndSubmitWhatsAppApproval({
      submissionId,
      displayName: row.name,
      whatsappTemplateName: waName,
      category: body.category,
      language: body.language,
      twilioTypesKey,
      typesPayload,
    });

    await query(
      `UPDATE template_submissions SET
        twilio_content_sid = $2,
        whatsapp_template_name = $3,
        whatsapp_category = $4,
        whatsapp_approval_status = $5,
        whatsapp_rejection_reason = NULL,
        external_template_id = COALESCE(external_template_id, $2),
        updated_at = NOW()
       WHERE id = $1`,
      [
        submissionId,
        contentSid,
        normalizeWhatsAppTemplateName(waName),
        body.category,
        approvalStatus ?? "received",
      ]
    );

    const poll = await fetchWhatsAppApprovalFromTwilio(contentSid);
    const persistResult = await persistWhatsAppApprovalPoll(submissionId, poll, row.vendor_id);

    res.json({
      ok: true,
      twilio_content_sid: contentSid,
      whatsapp_approval_status: poll.status ?? approvalStatus ?? "received",
      materialized_vendor_template: persistResult.materialized_vendor,
    });
  } catch (e) {
    next(e);
  }
});

/** Poll Twilio for WhatsApp/Meta template status — updates whatsapp_* only (never admin_status). */
router.post("/template-submissions/:id/sync-whatsapp", async (req: AuthedAdminRequest, res, next) => {
  try {
    const submissionId = String(req.params.id);
    const cur = await query<{
      twilio_content_sid: string | null;
      vendor_id: string | null;
    }>(`SELECT twilio_content_sid, vendor_id FROM template_submissions WHERE id = $1`, [submissionId]);
    if (cur.rows.length === 0) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    const row = cur.rows[0];
    if (!row.twilio_content_sid) {
      res.status(400).json({ error: "Nothing to sync — submit to WhatsApp first." });
      return;
    }

    const poll = await fetchWhatsAppApprovalFromTwilio(row.twilio_content_sid);
    const persistResult = await persistWhatsAppApprovalPoll(submissionId, poll, row.vendor_id);

    res.json({
      ok: true,
      whatsapp_approval_status: poll.status,
      materialized_vendor_template: persistResult.materialized_vendor,
      message:
        poll.status && !poll.status.toLowerCase().includes("approv") && !poll.status.toLowerCase().includes("reject")
          ? "Still pending WhatsApp review — sync again later."
          : undefined,
    });
  } catch (e) {
    next(e);
  }
});

router.post("/template-submissions/:id/assign", async (req: AuthedAdminRequest, res, next) => {
  try {
    const catalogSubmissionId = String(req.params.id);
    const body = z.object({ vendor_id: z.string().uuid() }).parse(req.body);
    const v = await query<{ subscription_tier: SubscriptionTier }>(
      `SELECT subscription_tier FROM vendors WHERE id = $1`,
      [body.vendor_id]
    );
    if (v.rows.length === 0) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    const result = await assignCatalogSubmissionToVendor(
      catalogSubmissionId,
      body.vendor_id,
      v.rows[0].subscription_tier
    );
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof Error) {
      res.status(400).json({ error: e.message });
      return;
    }
    next(e);
  }
});

export default router;
