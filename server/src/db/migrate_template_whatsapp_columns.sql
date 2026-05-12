ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS twilio_content_sid VARCHAR(64);
ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(512);
ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS whatsapp_category VARCHAR(32);
ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS whatsapp_approval_status VARCHAR(32);
ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS whatsapp_rejection_reason TEXT;
