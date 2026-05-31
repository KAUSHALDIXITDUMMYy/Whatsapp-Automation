-- Subscriber sheet: joining date, computed recharge due, rent paid tracking, vendor billing cycle

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly';
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_billing_cycle_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_billing_cycle_check
  CHECK (billing_cycle IN ('weekly', 'biweekly', 'monthly', 'quarterly'));

ALTER TABLE customers ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS recharge_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rent_paid_until DATE;

CREATE INDEX IF NOT EXISTS idx_customers_recharge_date ON customers(vendor_id, recharge_date);
CREATE INDEX IF NOT EXISTS idx_customers_joining_date ON customers(vendor_id, joining_date);

-- Backfill recharge_date from custom_fields for existing rows
UPDATE customers
SET recharge_date = (custom_fields->>'recharge_date')::date
WHERE recharge_date IS NULL
  AND custom_fields->>'recharge_date' ~ '^\d{4}-\d{2}-\d{2}';

UPDATE customers
SET joining_date = (custom_fields->>'joining_date')::date
WHERE joining_date IS NULL
  AND custom_fields->>'joining_date' ~ '^\d{4}-\d{2}-\d{2}';
