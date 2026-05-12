import type { Request, Response, NextFunction } from "express";
import { verifyVendorToken, verifyAdminToken } from "../utils/jwt.js";

export interface AuthedVendorRequest extends Request {
  vendorId?: string;
}

export interface AuthedAdminRequest extends Request {
  adminId?: string;
}

export function requireVendor(req: AuthedVendorRequest, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }
    const token = header.slice(7);
    const payload = verifyVendorToken(token);
    req.vendorId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: AuthedAdminRequest, res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid authorization" });
      return;
    }
    const token = header.slice(7);
    const payload = verifyAdminToken(token);
    req.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
