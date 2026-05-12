import { Router } from "express";
import { config } from "../config.js";

const router = Router();

// Meta webhook verification (GET)
router.get("/", (req, res) => {
  const mode = String(req.query["hub.mode"] ?? "");
  const token = String(req.query["hub.verify_token"] ?? "");
  const challenge = String(req.query["hub.challenge"] ?? "");

  if (mode === "subscribe" && token && token === config.metaWhatsAppWebhookVerifyToken) {
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({ error: "Webhook verification failed" });
});

// Meta webhook events (POST)
router.post("/", (req, res) => {
  // We currently accept the webhook to avoid retries.
  // Next step (if you want inbound automation): parse `entry[].changes[]` and map to your customer/message tables.
  res.status(200).json({ ok: true });
});

export default router;

