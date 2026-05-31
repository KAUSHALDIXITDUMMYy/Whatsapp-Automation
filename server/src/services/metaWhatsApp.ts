import { config } from "../config.js";

export function metaGraphUrl(path: string): string {
  const base = `https://graph.facebook.com/${config.metaGraphVersion}`;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

export function isMetaWhatsAppConfigured(): boolean {
  return Boolean(
    config.metaWhatsAppAccessToken?.trim() &&
      config.metaWhatsAppPhoneNumberId?.trim()
  );
}

export function isMetaTemplateApiConfigured(): boolean {
  return Boolean(
    config.metaWhatsAppAccessToken?.trim() &&
      config.metaWhatsAppBusinessAccountId?.trim()
  );
}

export function metaAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.metaWhatsAppAccessToken}`,
    "Content-Type": "application/json",
  };
}
