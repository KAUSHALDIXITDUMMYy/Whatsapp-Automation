-- Rich Twilio Content types (text, quick-reply, call-to-action, list-picker, catalog).

ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS twilio_types_key VARCHAR(64) NOT NULL DEFAULT 'twilio/text';
ALTER TABLE template_submissions ADD COLUMN IF NOT EXISTS types_payload JSONB NOT NULL DEFAULT '{"body":""}'::jsonb;

UPDATE template_submissions
SET types_payload = jsonb_build_object('body', body)
WHERE types_payload IS NULL
   OR types_payload = '{}'::jsonb
   OR (types_payload->>'body' IS NULL OR types_payload->>'body' = '');
