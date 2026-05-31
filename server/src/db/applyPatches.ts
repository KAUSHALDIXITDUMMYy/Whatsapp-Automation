/** Apply incremental SQL patches only (safe when schema.sql already ran). */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const patches = [
  "subscription_upgrade.sql",
  "migrate_template_submissions.sql",
  "migrate_template_whatsapp_columns.sql",
  "migrate_rename_status_to_admin_status.sql",
  "migrate_vendor_dashboard_reminders.sql",
  "migrate_template_content_types.sql",
  "migrate_remove_twilio.sql",
  "migrate_message_template_language.sql",
  "migrate_messages_inbound.sql",
  "migrate_cable_subscriber.sql",
  "migrate_platform_simplify.sql",
  "migrate_subscriber_billing.sql",
];

async function main() {
  for (const file of patches) {
    console.log(`Applying ${file}…`);
    await pool.query(readFileSync(join(__dirname, file), "utf-8"));
  }
  console.log("Patches applied successfully.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
