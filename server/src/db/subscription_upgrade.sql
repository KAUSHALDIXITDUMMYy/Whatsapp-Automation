-- Idempotent upgrade for databases created before subscription columns existed.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(16) NOT NULL DEFAULT 'basic';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS whatsapp_sender VARCHAR(64);
