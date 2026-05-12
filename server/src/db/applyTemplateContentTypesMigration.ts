import "dotenv/config";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(__dirname, "migrate_template_content_types.sql"), "utf-8");
  await pool.query(sql);
  console.log("OK: template content types migration applied (or already present).");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
