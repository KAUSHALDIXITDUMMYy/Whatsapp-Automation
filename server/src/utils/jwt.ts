import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";
import { config } from "../config.js";

export type JwtRole = "vendor" | "admin";

export interface VendorPayload {
  sub: string;
  role: "vendor";
}

export interface AdminPayload {
  sub: string;
  role: "admin";
}

export function signVendorToken(vendorId: string): string {
  const opts: SignOptions = {
    expiresIn: config.jwtExpiresIn as NonNullable<SignOptions["expiresIn"]>,
  };
  return jwt.sign({ sub: vendorId, role: "vendor" as const }, config.jwtSecret as Secret, opts);
}

export function signAdminToken(adminId: string): string {
  const opts: SignOptions = {
    expiresIn: config.jwtExpiresIn as NonNullable<SignOptions["expiresIn"]>,
  };
  return jwt.sign({ sub: adminId, role: "admin" as const }, config.adminJwtSecret as Secret, opts);
}

export function verifyVendorToken(token: string): VendorPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as VendorPayload;
  if (decoded.role !== "vendor") throw new Error("Invalid token");
  return decoded;
}

export function verifyAdminToken(token: string): AdminPayload {
  const decoded = jwt.verify(token, config.adminJwtSecret) as AdminPayload;
  if (decoded.role !== "admin") throw new Error("Invalid token");
  return decoded;
}
