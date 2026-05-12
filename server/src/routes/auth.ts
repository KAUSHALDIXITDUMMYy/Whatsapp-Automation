import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signVendorToken, signAdminToken } from "../utils/jwt.js";

const router = Router();

const registerSchema = z.object({
  company_name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const adminLoginSchema = loginSchema;

router.post("/vendor/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const pw = await hashPassword(body.password);
    const r = await query<{ id: string }>(
      `INSERT INTO vendors (company_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [body.company_name, body.email.toLowerCase(), pw]
    );
    const token = signVendorToken(r.rows[0].id);
    res.status(201).json({
      token,
      vendor: { id: r.rows[0].id, company_name: body.company_name, email: body.email.toLowerCase() },
    });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    next(e);
  }
});

router.post("/vendor/login", async (req, res, next) => {
  const body = loginSchema.parse(req.body);
  const r = await query<{ id: string; password_hash: string; company_name: string; email: string }>(
    `SELECT id, password_hash, company_name, email FROM vendors WHERE email = $1`,
    [body.email.toLowerCase()]
  );
  if (r.rows.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const row = r.rows[0];
  const ok = await verifyPassword(body.password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signVendorToken(row.id);
  res.json({
    token,
    vendor: { id: row.id, company_name: row.company_name, email: row.email },
  });
});

router.post("/admin/login", async (req, res, next) => {
  const body = adminLoginSchema.parse(req.body);
  const r = await query<{ id: string; password_hash: string }>(
    `SELECT id, password_hash FROM admins WHERE email = $1`,
    [body.email.toLowerCase()]
  );
  if (r.rows.length === 0) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const row = r.rows[0];
  const ok = await verifyPassword(body.password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signAdminToken(row.id);
  res.json({ token, admin: { id: row.id, email: body.email.toLowerCase() } });
});

export default router;
