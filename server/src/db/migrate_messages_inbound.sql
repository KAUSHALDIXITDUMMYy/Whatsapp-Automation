-- Inbound WhatsApp messages + delivery status updates

ALTER TABLE messages_log ADD COLUMN IF NOT EXISTS direction VARCHAR(16) NOT NULL DEFAULT 'outbound';
ALTER TABLE messages_log ADD COLUMN IF NOT EXISTS meta_message_id VARCHAR(128);

ALTER TABLE messages_log DROP CONSTRAINT IF EXISTS messages_log_status_check;
ALTER TABLE messages_log ADD CONSTRAINT messages_log_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'received', 'delivered', 'read'));

CREATE INDEX IF NOT EXISTS idx_messages_log_customer_dir ON messages_log(vendor_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_log_meta_id ON messages_log(meta_message_id) WHERE meta_message_id IS NOT NULL;
