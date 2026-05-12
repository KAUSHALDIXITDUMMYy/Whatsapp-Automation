import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Idempotent: safe to run if objects already exist. */
async function main() {
  const sql = readFileSync(join(__dirname, "migrate_template_submissions.sql"), "utf-8");
  await pool.query(sql);
  const wx = readFileSync(join(__dirname, "migrate_template_whatsapp_columns.sql"), "utf-8");
  await pool.query(wx);
  const renameAdmin = readFileSync(join(__dirname, "migrate_rename_status_to_admin_status.sql"), "utf-8");
  await pool.query(renameAdmin);
  console.log("OK: template_submissions migration applied (or already present).");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
