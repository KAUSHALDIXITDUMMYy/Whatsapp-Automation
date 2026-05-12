import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  const patch = readFileSync(join(__dirname, "subscription_upgrade.sql"), "utf-8");
  await pool.query(patch);
  const templatePatch = readFileSync(join(__dirname, "migrate_template_submissions.sql"), "utf-8");
  await pool.query(templatePatch);
  const whatsappCols = readFileSync(join(__dirname, "migrate_template_whatsapp_columns.sql"), "utf-8");
  await pool.query(whatsappCols);
  const renameAdmin = readFileSync(join(__dirname, "migrate_rename_status_to_admin_status.sql"), "utf-8");
  await pool.query(renameAdmin);
  const dashRem = readFileSync(join(__dirname, "migrate_vendor_dashboard_reminders.sql"), "utf-8");
  await pool.query(dashRem);
  const contentTypes = readFileSync(join(__dirname, "migrate_template_content_types.sql"), "utf-8");
  await pool.query(contentTypes);
  console.log("Migration applied successfully.");
  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
