-- WhatsApp CRM & Reminder System — PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(16) NOT NULL DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'pro')),
  subscription_expires_at TIMESTAMPTZ,
  whatsapp_sender VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendors_email ON vendors(email);

CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  field_key VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  field_type VARCHAR(16) NOT NULL CHECK (field_type IN ('date', 'text', 'number')),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, field_key)
);

CREATE INDEX idx_custom_field_definitions_vendor ON custom_field_definitions(vendor_id);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, phone)
);

CREATE INDEX idx_customers_vendor ON customers(vendor_id);
CREATE INDEX idx_customers_tags ON customers USING GIN (tags);
CREATE INDEX idx_custom_fields_gin ON customers USING GIN (custom_fields);

CREATE TABLE csv_mapping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  mapping JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csv_templates_vendor ON csv_mapping_templates(vendor_id);

CREATE TABLE dynamic_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dynamic_groups_vendor ON dynamic_groups(vendor_id);

CREATE TABLE template_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  twilio_types_key VARCHAR(64) NOT NULL DEFAULT 'twilio/text',
  types_payload JSONB NOT NULL DEFAULT '{"body":""}'::jsonb,
  external_template_id VARCHAR(255),
  twilio_content_sid VARCHAR(64),
  whatsapp_template_name VARCHAR(512),
  whatsapp_category VARCHAR(32),
  whatsapp_approval_status VARCHAR(32),
  whatsapp_rejection_reason TEXT,
  admin_status VARCHAR(32) NOT NULL DEFAULT 'none' CHECK (admin_status IN ('none', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  resubmits_id UUID REFERENCES template_submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_catalog_or_vendor CHECK (
    (vendor_id IS NULL AND resubmits_id IS NULL) OR (vendor_id IS NOT NULL)
  )
);

CREATE INDEX idx_template_submissions_vendor ON template_submissions(vendor_id);
CREATE INDEX idx_template_submissions_admin_status ON template_submissions(admin_status);

CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  external_template_id VARCHAR(255),
  source_submission_id UUID REFERENCES template_submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_templates_vendor ON message_templates(vendor_id);
CREATE UNIQUE INDEX uniq_message_templates_vendor_source ON message_templates(vendor_id, source_submission_id)
  WHERE source_submission_id IS NOT NULL;

CREATE TABLE reminder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  date_field_key VARCHAR(64) NOT NULL,
  trigger_type VARCHAR(16) NOT NULL CHECK (trigger_type IN ('on_date', 'before_days')),
  days_before INT,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_days_before CHECK (
    (trigger_type = 'before_days' AND days_before IS NOT NULL AND days_before >= 0)
    OR (trigger_type = 'on_date' AND days_before IS NULL)
  )
);

CREATE INDEX idx_reminder_rules_vendor ON reminder_rules(vendor_id);
CREATE INDEX idx_reminder_rules_active ON reminder_rules(is_active) WHERE is_active = true;

CREATE TABLE messages_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  phone VARCHAR(32) NOT NULL,
  body TEXT NOT NULL,
  template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  provider_message_id VARCHAR(255),
  provider_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_log_vendor ON messages_log(vendor_id);
CREATE INDEX idx_messages_log_created ON messages_log(vendor_id, created_at DESC);

CREATE TABLE reminder_dispatch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES reminder_rules(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  dispatch_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, customer_id, dispatch_date)
);

CREATE INDEX idx_reminder_dispatch_rule ON reminder_dispatch_log(rule_id);

CREATE TABLE vendor_dashboard_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_vendor_dashboard_reminders_vendor_unread
  ON vendor_dashboard_reminders(vendor_id)
  WHERE read_at IS NULL;

CREATE INDEX idx_vendor_dashboard_reminders_created
  ON vendor_dashboard_reminders(vendor_id, created_at DESC);
