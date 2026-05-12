import "dotenv/config";
import { hashPassword } from "../utils/password.js";
import { query, pool } from "./pool.js";

async function seed() {
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.ADMIN_PASSWORD ?? "adminadmin";
  const pw = await hashPassword(password);
  await query(
    `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase(), pw]
  );
  console.log(`Admin ensured: ${email} (password from ADMIN_PASSWORD or default 'adminadmin')`);
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
