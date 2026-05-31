-- Rename Twilio columns to Meta-neutral names (idempotent).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_submissions' AND column_name = 'twilio_types_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_submissions' AND column_name = 'template_types_key'
  ) THEN
    ALTER TABLE template_submissions RENAME COLUMN twilio_types_key TO template_types_key;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_submissions' AND column_name = 'twilio_content_sid'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_submissions' AND column_name = 'meta_template_id'
  ) THEN
    ALTER TABLE template_submissions RENAME COLUMN twilio_content_sid TO meta_template_id;
  END IF;
END $$;

ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS template_types_key VARCHAR(64) NOT NULL DEFAULT 'text';
ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS meta_template_id VARCHAR(128);

UPDATE template_submissions SET template_types_key = 'text' WHERE template_types_key = 'twilio/text';
UPDATE template_submissions SET template_types_key = 'quick_reply' WHERE template_types_key = 'twilio/quick-reply';
UPDATE template_submissions SET template_types_key = 'call_to_action' WHERE template_types_key = 'twilio/call-to-action';
UPDATE template_submissions SET template_types_key = 'list_picker' WHERE template_types_key = 'twilio/list-picker';
UPDATE template_submissions SET template_types_key = 'catalog' WHERE template_types_key = 'twilio/catalog';
