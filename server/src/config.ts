import "dotenv/config";

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: required("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/whatsapp_crm"),
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  jwtSecret: required("JWT_SECRET", "dev-change-me-in-production-use-long-random-string"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  adminJwtSecret:
    process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET ?? "dev-change-me-in-production-use-long-random-string",
  /** @deprecated Moving away from Twilio WhatsApp; kept for backwards compatibility. */
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  /** @deprecated Moving away from Twilio WhatsApp; kept for backwards compatibility. */
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  /** @deprecated Moving away from Twilio WhatsApp; kept for backwards compatibility. */
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM ?? "",

  /** Meta WhatsApp Cloud API */
  metaGraphVersion: process.env.META_GRAPH_VERSION ?? "v22.0",
  metaWhatsAppAccessToken: process.env.META_WHATSAPP_ACCESS_TOKEN ?? "",
  metaWhatsAppPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? "",
  metaWhatsAppWebhookVerifyToken: process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "",
  /** Basic tier: max saved message templates (Pro = unlimited). */
  basicMaxTemplates: parseInt(process.env.BASIC_MAX_TEMPLATES ?? "5", 10),
  /**
   * Local dev on Windows without Redis: set SKIP_REDIS=true to send WhatsApp inline (no BullMQ).
   * Production should use Redis + worker.
   */
  skipRedis: process.env.SKIP_REDIS === "true",
  nodeEnv: process.env.NODE_ENV ?? "development",
};
