-- Split CRM admin review (admin_status) from WhatsApp/Meta (whatsapp_* columns).
-- Safe if already migrated.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'template_submissions' AND column_name = 'status'
  ) THEN
    ALTER TABLE template_submissions DROP CONSTRAINT IF EXISTS template_submissions_status_check;
    ALTER TABLE template_submissions RENAME COLUMN status TO admin_status;
    ALTER TABLE template_submissions ADD CONSTRAINT template_submissions_admin_status_check
      CHECK (admin_status IN ('none', 'pending', 'approved', 'rejected'));
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_template_submissions_status') THEN
      ALTER INDEX idx_template_submissions_status RENAME TO idx_template_submissions_admin_status;
    END IF;
  END IF;
END $$;

-- Safe after legacy rename or on fresh installs that already use admin_status (IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_template_submissions_admin_status ON template_submissions(admin_status);
