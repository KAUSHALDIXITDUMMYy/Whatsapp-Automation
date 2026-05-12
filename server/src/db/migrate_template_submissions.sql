-- Run once against an existing DB created before template approvals (safe to run if objects already exist).

CREATE TABLE IF NOT EXISTS template_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  external_template_id VARCHAR(255),
  admin_status VARCHAR(32) NOT NULL DEFAULT 'none' CHECK (admin_status IN ('none', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  resubmits_id UUID REFERENCES template_submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_catalog_or_vendor CHECK (
    (vendor_id IS NULL AND resubmits_id IS NULL) OR (vendor_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_template_submissions_vendor ON template_submissions(vendor_id);
-- Index on admin_status is created in migrate_rename_status_to_admin_status.sql (after status→admin_status rename).

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS source_submission_id UUID REFERENCES template_submissions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_message_templates_vendor_source ON message_templates(vendor_id, source_submission_id)
  WHERE source_submission_id IS NOT NULL;
