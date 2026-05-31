-- Cable subscriber: auto-welcome, WhatsApp self-service, technician bookings

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS welcome_on_create_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS welcome_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS appointment_slot_times JSONB NOT NULL DEFAULT '["09:00","10:00","11:00","12:00","14:00","15:00","16:00","17:00"]'::jsonb;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS appointment_days_ahead INT NOT NULL DEFAULT 7;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS whatsapp_menu_greeting TEXT;

CREATE TABLE IF NOT EXISTS customer_whatsapp_sessions (
  customer_id UUID PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  state VARCHAR(64) NOT NULL DEFAULT 'idle',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_whatsapp_sessions_vendor ON customer_whatsapp_sessions(vendor_id);

CREATE TABLE IF NOT EXISTS technician_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technician_appointments_vendor_date
  ON technician_appointments(vendor_id, appointment_date DESC);
