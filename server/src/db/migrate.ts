import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSql(name: string): string {
  return readFileSync(join(__dirname, name), "utf-8");
}

async function tableExists(tableName: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return r.rows.length > 0;
}

async function migrate() {
  if (!(await tableExists("admins"))) {
    console.log("Applying schema.sql (fresh database)…");
    await pool.query(loadSql("schema.sql"));
  } else {
    console.log("Database already initialized — skipping schema.sql");
  }

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

  for (const file of patches) {
    console.log(`Applying ${file}…`);
    await pool.query(loadSql(file));
  }

  console.log("Migration applied successfully.");
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
