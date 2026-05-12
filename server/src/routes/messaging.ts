import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { config } from "../config.js";
import { requireVendor, type AuthedVendorRequest } from "../middleware/auth.js";
import { enqueueOutboundMessage, resolveRecipientPhones, resolveTemplateBody } from "../services/messageJobs.js";
import {
  assertSendAllowedForTier,
  assertSubscriptionActive,
  getVendorSubscription,
  isSubscriptionActive,
} from "../services/subscription.js";
import { isRejectedStatus } from "../services/twilioWhatsAppTemplateSubmit.js";
import { normalizeTemplateSubmissionInput } from "../services/twilioContentTypes.js";

const router = Router();
router.use(requireVendor);

router.get("/templates", async (req: AuthedVendorRequest, res) => {
  const r = await query(
    `SELECT id, name, body, external_template_id, source_submission_id, created_at
     FROM message_templates WHERE vendor_id = $1 ORDER BY name`,
    [req.vendorId]
  );
  const sub = await getVendorSubscription(req.vendorId!);
  res.json({
    templates: r.rows,
    limits: {
      tier: sub?.subscription_tier ?? "basic",
      basic_max_templates: config.basicMaxTemplates,
      template_count: r.rows.length,
    },
  });
});

router.get("/template-submissions", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const r = await query(
    `SELECT id, vendor_id, name, body, twilio_types_key, types_payload, external_template_id,
            admin_status, whatsapp_approval_status, whatsapp_rejection_reason,
            rejection_reason, resubmits_id, created_at, updated_at
     FROM template_submissions WHERE vendor_id = $1
     ORDER BY created_at DESC`,
    [vendorId]
  );
  res.json({ submissions: r.rows });
});

router.post("/template-submissions", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const sub = await getVendorSubscription(vendorId);
    if (!sub) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    assertSubscriptionActive(sub);
    if (sub.subscription_tier !== "pro") {
      res.status(403).json({
        error:
          "Only Pro accounts can submit templates for approval. On Basic, ask an administrator to assign approved templates to your account.",
      });
      return;
    }

    const raw = z
      .object({
        name: z.string().min(1).max(255),
        body: z.string().optional(),
        twilio_types_key: z.string().optional(),
        types_payload: z.unknown().optional(),
        resubmits_id: z.string().uuid().optional(),
      })
      .parse(req.body);

    let normalized: { twilio_types_key: string; types_payload: Record<string, unknown>; body: string };
    try {
      normalized = normalizeTemplateSubmissionInput(raw);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid template payload";
      res.status(400).json({ error: msg });
      return;
    }

    if (raw.resubmits_id) {
      const old = await query<{
        vendor_id: string;
        admin_status: string;
        whatsapp_approval_status: string | null;
      }>(`SELECT vendor_id, admin_status, whatsapp_approval_status FROM template_submissions WHERE id = $1`, [
        raw.resubmits_id,
      ]);
      if (old.rows.length === 0 || old.rows[0].vendor_id !== vendorId) {
        res.status(400).json({
          error: "Can only resubmit a submission that was rejected by admin or by WhatsApp, and that belongs to you.",
        });
        return;
      }
      const wasRejected =
        old.rows[0].admin_status === "rejected" ||
        isRejectedStatus(old.rows[0].whatsapp_approval_status ?? undefined);
      if (!wasRejected) {
        res.status(400).json({
          error: "Can only resubmit a submission that was rejected by admin or by WhatsApp, and that belongs to you.",
        });
        return;
      }
    }

    const ins = await query<{ id: string }>(
      `INSERT INTO template_submissions (vendor_id, name, body, admin_status, resubmits_id, twilio_types_key, types_payload)
       VALUES ($1, $2, $3, 'none', $4, $5, $6::jsonb)
       RETURNING id`,
      [
        vendorId,
        raw.name,
        normalized.body,
        raw.resubmits_id ?? null,
        normalized.twilio_types_key,
        JSON.stringify(normalized.types_payload),
      ]
    );
    res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    next(e);
  }
});

router.post("/templates", async (_req: AuthedVendorRequest, res) => {
  res.status(403).json({
    error:
      "Direct template creation is disabled. Open Templates: Pro users submit for administrator approval; Basic users rely on administrator-assigned templates.",
  });
});

router.patch("/templates/:id", async (req: AuthedVendorRequest, res, next) => {
  try {
    const vendorId = req.vendorId!;
    const sub = await getVendorSubscription(vendorId);
    if (!sub || sub.subscription_tier !== "pro") {
      res.status(403).json({
        error:
          "Only Pro accounts can edit saved templates. Basic accounts use templates assigned by an administrator.",
      });
      return;
    }
    assertSubscriptionActive(sub);

    const body = z
      .object({
        name: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        external_template_id: z.string().nullable().optional(),
      })
      .parse(req.body);
    const updates: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.name !== undefined) {
      updates.push(`name = $${i++}`);
      params.push(body.name);
    }
    if (body.body !== undefined) {
      updates.push(`body = $${i++}`);
      params.push(body.body);
    }
    if (body.external_template_id !== undefined) {
      updates.push(`external_template_id = $${i++}`);
      params.push(body.external_template_id);
    }
    if (updates.length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }
    params.push(vendorId, String(req.params.id));
    const r = await query(
      `UPDATE message_templates SET ${updates.join(", ")} WHERE vendor_id = $${i++} AND id = $${i} RETURNING id`,
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

router.delete("/templates/:id", async (req: AuthedVendorRequest, res) => {
  const vendorId = req.vendorId!;
  const sub = await getVendorSubscription(vendorId);
  if (!sub || sub.subscription_tier !== "pro") {
    res.status(403).json({
      error:
        "Only Pro accounts can delete saved templates. Basic accounts use templates assigned by an administrator.",
    });
    return;
  }
  if (!isSubscriptionActive(sub)) {
    res.status(403).json({ error: "Subscription inactive or expired." });
    return;
  }

  const r = await query(`DELETE FROM message_templates WHERE vendor_id = $1 AND id = $2 RETURNING id`, [
    vendorId,
    String(req.params.id),
  ]);
  if (r.rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

const sendSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    customer_id: z.string().uuid(),
    body: z.string().optional(),
    template_id: z.string().uuid().optional(),
  }),
  z.object({
    mode: z.literal("bulk"),
    body: z.string().optional(),
    template_id: z.string().uuid().optional(),
    customer_ids: z.array(z.string().uuid()).optional(),
    group_id: z.string().uuid().optional(),
    filters: z
      .object({
        tags: z.array(z.string()).optional(),
        tag_mode: z.enum(["any", "all"]).optional(),
        custom_fields: z.record(z.string()).optional(),
      })
      .optional(),
  }),
]);

router.post("/send", async (req: AuthedVendorRequest, res, next) => {
  try {
    const body = sendSchema.parse(req.body);
    const vendorId = req.vendorId!;
    const sub = await getVendorSubscription(vendorId);
    if (!sub) {
      res.status(404).json({ error: "Vendor not found" });
      return;
    }
    assertSubscriptionActive(sub);

    const templateId = body.template_id;
    const explicitBody = body.body;
    assertSendAllowedForTier(sub.subscription_tier, templateId, explicitBody);

    const resolvedBody =
      sub.subscription_tier === "pro"
        ? await resolveTemplateBody(vendorId, templateId, explicitBody)
        : await resolveTemplateBody(vendorId, templateId, undefined);

    if (body.mode === "single") {
      const c = await query<{ phone: string }>(
        `SELECT phone FROM customers WHERE vendor_id = $1 AND id = $2`,
        [vendorId, body.customer_id]
      );
      if (c.rows.length === 0) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      const log = await query<{ id: string }>(
        `INSERT INTO messages_log (vendor_id, customer_id, phone, body, template_id, status)
         VALUES ($1, $2, $3, $4, $5, 'queued')
         RETURNING id`,
        [vendorId, body.customer_id, c.rows[0].phone, resolvedBody, templateId ?? null]
      );
      await enqueueOutboundMessage(log.rows[0].id);
      res.status(202).json({ queued: 1, log_ids: [log.rows[0].id] });
      return;
    }

    const targeting =
      (body.customer_ids?.length ?? 0) > 0
        ? { customer_ids: body.customer_ids }
        : body.group_id
          ? { group_id: body.group_id }
          : { filters: body.filters ?? {} };

    if (
      !body.customer_ids?.length &&
      !body.group_id &&
      (!body.filters || Object.keys(body.filters).length === 0)
    ) {
      res.status(400).json({
        error: "Bulk send requires customer_ids, group_id, or non-empty filters",
      });
      return;
    }

    const recipients = await resolveRecipientPhones(vendorId, targeting);
    const logIds: string[] = [];
    for (const rec of recipients) {
      const log = await query<{ id: string }>(
        `INSERT INTO messages_log (vendor_id, customer_id, phone, body, template_id, status)
         VALUES ($1, $2, $3, $4, $5, 'queued')
         RETURNING id`,
        [vendorId, rec.id, rec.phone, resolvedBody, templateId ?? null]
      );
      logIds.push(log.rows[0].id);
      await enqueueOutboundMessage(log.rows[0].id);
    }
    res.status(202).json({ queued: recipients.length, log_ids: logIds });
  } catch (e) {
    if (e instanceof Error) {
      const m = e.message;
      if (
        m.includes("Provide a template") ||
        m.includes("Basic plan requires") ||
        m.includes("subscription has expired") ||
        m.includes("Upgrade to Pro")
      ) {
        res.status(400).json({ error: m });
        return;
      }
    }
    next(e);
  }
});

router.get("/logs", async (req: AuthedVendorRequest, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  const r = await query(
    `SELECT id, customer_id, phone, status, provider_message_id, provider_error, created_at
     FROM messages_log WHERE vendor_id = $1
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.vendorId, limit, offset]
  );
  const cnt = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM messages_log WHERE vendor_id = $1`,
    [req.vendorId]
  );
  res.json({ logs: r.rows, total: parseInt(cnt.rows[0].n, 10) });
});

export default router;
