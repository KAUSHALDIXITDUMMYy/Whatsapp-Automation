import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(__dirname, "migrate_vendor_dashboard_reminders.sql"), "utf-8");
  await pool.query(sql);
  console.log("OK: vendor_dashboard_reminders migration applied (or already present).");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
