import { query } from "../db/pool.js";
import { config } from "../config.js";
import type { SubscriptionTier } from "./subscription.js";
import {
  isApprovedStatus,
  isRejectedStatus,
  type WhatsAppApprovalPoll,
} from "./twilioWhatsAppTemplateSubmit.js";

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
      twilio_content_sid: string | null;
      whatsapp_approval_status: string | null;
    }
  >(
    `SELECT id, vendor_id, name, body, external_template_id, twilio_content_sid, admin_status,
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

  const extId = row.external_template_id ?? row.twilio_content_sid ?? null;
  await query(
    `INSERT INTO message_templates (vendor_id, name, body, external_template_id, source_submission_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [row.vendor_id, row.name, row.body, extId, submissionId]
  );
  return true;
}

/** Persist Twilio poll results — updates WhatsApp fields only (never admin_status). Materializes vendor template when Meta approves. */
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
        external_template_id = COALESCE(external_template_id, twilio_content_sid),
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

/** Copy an approved catalog submission into a vendor's templates. Requires WhatsApp approved OR admin approved. */
export async function assignCatalogSubmissionToVendor(
  submissionId: string,
  vendorId: string,
  tier: SubscriptionTier
): Promise<{ template_id: string }> {
  await ensureVendorTemplateSlot(vendorId, tier);
  const r = await query<
    TemplateSubmissionRow & { twilio_content_sid: string | null; whatsapp_approval_status: string | null }
  >(
    `SELECT id, vendor_id, name, body, external_template_id, twilio_content_sid, admin_status,
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
  const extId = row.external_template_id ?? row.twilio_content_sid ?? null;
  const ins = await query<{ id: string }>(
    `INSERT INTO message_templates (vendor_id, name, body, external_template_id, source_submission_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [vendorId, row.name, row.body, extId, submissionId]
  );
  return { template_id: ins.rows[0].id };
}
