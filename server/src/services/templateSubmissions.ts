import { query } from "../db/pool.js";
import { config } from "../config.js";
import type { SubscriptionTier } from "./subscription.js";
import {
  isApprovedStatus,
  isRejectedStatus,
  type WhatsAppApprovalPoll,
} from "./metaWhatsAppTemplate.js";

export type TemplateSubmissionRow = {
  id: string;
  vendor_id: string | null;
  name: string;
  body: string;
  external_template_id: string | null;
  admin_status: string;
  rejection_reason: string | null;
  resubmits_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function ensureVendorTemplateSlot(
  vendorId: string,
  tier: SubscriptionTier
): Promise<void> {
  if (tier === "pro") return;
  const c = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM message_templates WHERE vendor_id = $1`,
    [vendorId]
  );
  const n = parseInt(c.rows[0].n, 10);
  if (n >= config.basicMaxTemplates) {
    throw new Error(
      `This vendor is at the Basic plan limit of ${config.basicMaxTemplates} templates. Remove a template or upgrade them to Pro before assigning another.`
    );
  }
}

/**
 * Creates vendor message_templates row when WhatsApp approved **or** admin manually approved (CRM).
 */
export async function materializeVendorTemplateIfEligible(submissionId: string): Promise<boolean> {
  const r = await query<
    TemplateSubmissionRow & {
      meta_template_id: string | null;
      whatsapp_approval_status: string | null;
    }
  >(
    `SELECT id, vendor_id, name, body, external_template_id, meta_template_id, admin_status,
            whatsapp_approval_status, rejection_reason, resubmits_id, created_at, updated_at
     FROM template_submissions WHERE id = $1`,
    [submissionId]
  );
  const row = r.rows[0];
  if (!row?.vendor_id) return false;

  const waOk = isApprovedStatus(row.whatsapp_approval_status ?? undefined);
  const adminOk = row.admin_status === "approved";
  if (!waOk && !adminOk) return false;

  const exists = await query(
    `SELECT id FROM message_templates WHERE vendor_id = $1 AND source_submission_id = $2`,
    [row.vendor_id, submissionId]
  );
  if (exists.rows.length > 0) return true;

  const extId = row.external_template_id ?? row.meta_template_id ?? null;
  const subLang = await query<{ whatsapp_template_name: string | null }>(
    `SELECT whatsapp_template_name FROM template_submissions WHERE id = $1`,
    [submissionId]
  );
  const templateName = subLang.rows[0]?.whatsapp_template_name ?? row.name;
  await query(
    `INSERT INTO message_templates (vendor_id, name, body, external_template_id, whatsapp_template_language, source_submission_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.vendor_id, templateName, row.body, extId, "en_US", submissionId]
  );
  return true;
}

/** Persist Meta template poll — updates WhatsApp fields only (never admin_status). */
export async function persistWhatsAppApprovalPoll(
  submissionId: string,
  poll: WhatsAppApprovalPoll,
  vendorId: string | null
): Promise<{ materialized_vendor: boolean }> {
  await query(
    `UPDATE template_submissions SET
      whatsapp_approval_status = $2,
      whatsapp_rejection_reason = $3,
      updated_at = NOW()
     WHERE id = $1`,
    [submissionId, poll.status ?? null, poll.rejectionReason ?? null]
  );

  if (isApprovedStatus(poll.status)) {
    await query(
      `UPDATE template_submissions SET
        external_template_id = COALESCE(external_template_id, meta_template_id),
        updated_at = NOW()
       WHERE id = $1`,
      [submissionId]
    );
    if (vendorId) {
      const ok = await materializeVendorTemplateIfEligible(submissionId);
      return { materialized_vendor: ok };
    }
    return { materialized_vendor: false };
  }

  if (isRejectedStatus(poll.status)) {
    return { materialized_vendor: false };
  }

  return { materialized_vendor: false };
}

/** Copy an approved catalog submission into a vendor's templates. */
export async function assignCatalogSubmissionToVendor(
  submissionId: string,
  vendorId: string,
  tier: SubscriptionTier
): Promise<{ template_id: string }> {
  await ensureVendorTemplateSlot(vendorId, tier);
  const r = await query<
    TemplateSubmissionRow & { meta_template_id: string | null; whatsapp_approval_status: string | null }
  >(
    `SELECT id, vendor_id, name, body, external_template_id, meta_template_id, admin_status,
            whatsapp_approval_status, rejection_reason, resubmits_id, created_at, updated_at
     FROM template_submissions WHERE id = $1`,
    [submissionId]
  );
  const row = r.rows[0];
  if (!row || row.vendor_id !== null) {
    throw new Error("Not a platform catalog template");
  }
  const waOk = isApprovedStatus(row.whatsapp_approval_status ?? undefined);
  const adminOk = row.admin_status === "approved";
  if (!waOk && !adminOk) {
    throw new Error(
      "Catalog template must be approved by WhatsApp (sync status) or manually by admin before assigning."
    );
  }
  const dup = await query(
    `SELECT id FROM message_templates WHERE vendor_id = $1 AND source_submission_id = $2`,
    [vendorId, submissionId]
  );
  if (dup.rows.length > 0) {
    throw new Error("This catalog template is already assigned to this vendor");
  }
  const extId = row.external_template_id ?? row.meta_template_id ?? null;
  const ins = await query<{ id: string }>(
    `INSERT INTO message_templates (vendor_id, name, body, external_template_id, whatsapp_template_language, source_submission_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [vendorId, row.name, row.body, extId, "en_US", submissionId]
  );
  return { template_id: ins.rows[0].id };
}

/**
 * Copy every approved submission for this vendor into message_templates (idempotent).
 * Ensures Send messages / Campaign dropdown shows templates after WhatsApp or admin approval.
 */
export async function syncEligibleTemplatesForVendor(vendorId: string): Promise<number> {
  const pending = await query<{ id: string }>(
    `SELECT s.id
     FROM template_submissions s
     WHERE s.vendor_id = $1
       AND (
         s.admin_status = 'approved'
         OR LOWER(TRIM(COALESCE(s.whatsapp_approval_status, ''))) = 'approved'
       )
       AND NOT EXISTS (
         SELECT 1 FROM message_templates m
         WHERE m.vendor_id = $1 AND m.source_submission_id = s.id
       )`,
    [vendorId]
  );
  let created = 0;
  for (const row of pending.rows) {
    if (await materializeVendorTemplateIfEligible(row.id)) created++;
  }
  return created;
}

/** Assign a template that already exists in Meta (WhatsApp Manager) directly to a vendor. */
export async function assignMetaTemplateToVendor(
  vendorId: string,
  tier: SubscriptionTier,
  opts: { metaTemplateId: string; name: string; body: string; language?: string | null }
): Promise<{ template_id: string; already_assigned: boolean }> {
  await ensureVendorTemplateSlot(vendorId, tier);

  const dup = await query<{ id: string }>(
    `SELECT id FROM message_templates WHERE vendor_id = $1 AND external_template_id = $2`,
    [vendorId, opts.metaTemplateId]
  );
  if (dup.rows.length > 0) {
    return { template_id: dup.rows[0].id, already_assigned: true };
  }

  const lang = (opts.language ?? "en").trim().slice(0, 32) || "en";
  const ins = await query<{ id: string }>(
    `INSERT INTO message_templates (vendor_id, name, body, external_template_id, whatsapp_template_language)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [vendorId, opts.name.slice(0, 255), opts.body, opts.metaTemplateId, lang]
  );
  return { template_id: ins.rows[0].id, already_assigned: false };
}
