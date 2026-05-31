import { Router } from "express";
import { config } from "../config.js";
import { handleMetaWhatsAppWebhook } from "../services/metaWebhook.js";

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

// Meta webhook events (POST) — inbound messages + delivery status
router.post("/", async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    await handleMetaWhatsAppWebhook(req.body);
  } catch (e) {
    console.error("[meta-webhook] handler error", e);
  }
});

export default router;
