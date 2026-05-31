-- Platform-managed Meta templates (no per-vendor template assignment)

ALTER TABLE messages_log ADD COLUMN IF NOT EXISTS platform_template_name VARCHAR(128);

CREATE TABLE IF NOT EXISTS technician_call_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  preferred_date DATE NOT NULL,
  preferred_time VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'called', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technician_call_requests_vendor
  ON technician_call_requests(vendor_id, preferred_date DESC);
