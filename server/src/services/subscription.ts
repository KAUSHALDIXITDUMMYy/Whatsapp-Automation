import { query } from "../db/pool.js";

export type SubscriptionTier = "basic" | "pro";

export type VendorSubscription = {
  id: string;
  subscription_tier: SubscriptionTier;
  subscription_expires_at: Date | null;
  whatsapp_sender: string | null;
};

export function isSubscriptionActive(v: { subscription_expires_at: Date | null }): boolean {
  if (v.subscription_expires_at == null) return true;
  return new Date(v.subscription_expires_at).getTime() > Date.now();
}

export async function getVendorSubscription(vendorId: string): Promise<VendorSubscription | null> {
  const r = await query<VendorSubscription>(
    `SELECT id, subscription_tier, subscription_expires_at, whatsapp_sender FROM vendors WHERE id = $1`,
    [vendorId]
  );
  return r.rows[0] ?? null;
}

export function assertSubscriptionActive(v: VendorSubscription): void {
  if (!isSubscriptionActive(v)) {
    throw new Error("Your subscription has expired. Please renew to continue sending messages.");
  }
}

/** Basic: sends must use a saved template. Pro: free-text or template allowed. */
export function assertSendAllowedForTier(
  tier: SubscriptionTier,
  templateId: string | undefined,
  explicitBody: string | undefined
): void {
  if (tier === "basic") {
    if (!templateId) {
      throw new Error(
        "Basic plan requires a saved message template for each send. Create templates under Send messages, or upgrade to Pro for custom text without templates."
      );
    }
    return;
  }
  if (!templateId && (!explicitBody || !explicitBody.trim())) {
    throw new Error("Provide a template or message body.");
  }
}

/**
 * Twilio `from` WhatsApp address for Pro when `whatsapp_sender` is set; otherwise use platform default.
 */
export function resolveOutboundWhatsAppFrom(v: VendorSubscription): string | undefined {
  if (v.subscription_tier !== "pro") return undefined;
  const raw = v.whatsapp_sender?.trim();
  if (!raw) return undefined;
  if (raw.toLowerCase().startsWith("whatsapp:")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return undefined;
  return `whatsapp:+${digits}`;
}
