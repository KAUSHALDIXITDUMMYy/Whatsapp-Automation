-- Reminders from platform admins, shown on vendor dashboard until dismissed.

CREATE TABLE IF NOT EXISTS vendor_dashboard_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vendor_dashboard_reminders_vendor_unread
  ON vendor_dashboard_reminders(vendor_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_dashboard_reminders_created
  ON vendor_dashboard_reminders(vendor_id, created_at DESC);
