import {
  listLanguagesForMetaTemplate,
  listMetaWhatsAppTemplates,
  normalizeWhatsAppTemplateName,
  resolveMetaTemplateLanguage,
  type MetaListedTemplate,
} from "./metaWhatsAppTemplate.js";
import { countTemplateVariables, sendWhatsAppTemplateMessage } from "./whatsapp.js";

export type PreparedMetaTemplateSend = {
  templateName: string;
  languageCode: string;
  components?: Array<Record<string, unknown>>;
  bodyWithPlaceholders: string;
  variableCount: number;
};

type MetaComponentDef = {
  type?: string;
  text?: string;
  format?: string;
};

function formatTodayDate(): string {
  return new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const DEFAULT_TIME_TEXT = "10:00 AM";

/** Infer role of {{index}} from surrounding words in the approved template body. */
function classifyVariableRole(body: string, index: number): "date" | "time" | "name" | "unknown" {
  const ph = `{{${index}}}`;
  const pos = body.indexOf(ph);
  if (pos < 0) return "unknown";

  const window = (
    body.slice(Math.max(0, pos - 60), pos) + body.slice(pos, pos + ph.length + 60)
  ).toLowerCase();

  if (/\b(time|at\s*\{\{|\{\{\d+\}\}\s*(am|pm)|hour|o'clock)\b/.test(window)) return "time";
  if (/\b(date|visit on|on\s*\{\{|appointment|schedule|scheduled|due date|day)\b/.test(window))
    return "date";
  if (/\b(hello|hi|dear|welcome|greetings|thank you|thanks|name)\b/.test(window)) return "name";

  return "unknown";
}

/**
 * Fill {{1}}…{{n}} from template component text + customer context (no hardcoded template names).
 */
export function inferTemplateVariableValues(
  componentText: string,
  customerName?: string | null
): string[] {
  const slotCount = countTemplateVariables(componentText);
  if (slotCount === 0) return [];

  const name = customerName?.trim() || "";
  const today = formatTodayDate();
  const values: string[] = [];

  for (let i = 1; i <= slotCount; i++) {
    const role = classifyVariableRole(componentText, i);

    if (role === "date") {
      values.push(today);
      continue;
    }
    if (role === "time") {
      values.push(DEFAULT_TIME_TEXT);
      continue;
    }
    if (role === "name") {
      values.push(name || "Customer");
      continue;
    }

    if (slotCount === 1) {
      values.push(name || "—");
    } else if (i === 1) {
      values.push(name || today);
    } else if (i === 2) {
      values.push(DEFAULT_TIME_TEXT);
    } else {
      values.push("—");
    }
  }

  return values;
}

/** Build Meta send `components` from full template definition (HEADER + BODY, etc.). */
export function buildMetaSendComponentsFromDefinition(
  metaComponents: unknown[],
  customerName?: string | null
): Array<Record<string, unknown>> | undefined {
  const out: Array<Record<string, unknown>> = [];

  for (const raw of metaComponents) {
    const c = raw as MetaComponentDef;
    const type = (c.type ?? "").toUpperCase();
    const text = typeof c.text === "string" ? c.text : "";

    if (type === "HEADER") {
      const format = (c.format ?? "TEXT").toUpperCase();
      const slots = countTemplateVariables(text);
      if (slots > 0 && format === "TEXT") {
        const vals = inferTemplateVariableValues(text, customerName);
        out.push({
          type: "header",
          parameters: vals.map((v) => ({ type: "text", text: v.trim().slice(0, 60) || "—" })),
        });
      }
    } else if (type === "BODY") {
      const slots = countTemplateVariables(text);
      if (slots > 0) {
        const vals = inferTemplateVariableValues(text, customerName);
        out.push({
          type: "body",
          parameters: vals.map((v) => ({ type: "text", text: v.trim().slice(0, 1024) || "—" })),
        });
      }
    }
  }

  return out.length > 0 ? out : undefined;
}

function extractBodyText(metaComponents: unknown[]): string {
  for (const raw of metaComponents) {
    const c = raw as MetaComponentDef;
    if ((c.type ?? "").toUpperCase() === "BODY" && typeof c.text === "string") {
      return c.text;
    }
  }
  return "";
}

async function findMetaTemplateRow(opts: {
  templateName: string;
  metaTemplateId?: string | null;
  languageCode?: string;
}): Promise<MetaListedTemplate | null> {
  const list = await listMetaWhatsAppTemplates();
  const normalized = normalizeWhatsAppTemplateName(opts.templateName);
  const metaId = opts.metaTemplateId?.trim();

  if (metaId) {
    const byId = list.find((t) => t.id === metaId);
    if (byId) return byId;
  }

  const matches = list.filter((t) => normalizeWhatsAppTemplateName(t.name) === normalized);
  if (matches.length === 0) return null;

  if (opts.languageCode) {
    const lang = opts.languageCode.trim();
    const byLang = matches.find(
      (t) =>
        t.language?.trim().replace(/-/g, "_").toLowerCase() === lang.replace(/-/g, "_").toLowerCase()
    );
    if (byLang) return byLang;
  }

  return matches[0];
}

/**
 * Resolve language, body placeholders, and variable components from Meta (source of truth).
 */
export async function prepareMetaTemplateSend(opts: {
  templateName: string;
  storedLanguage?: string | null;
  metaTemplateId?: string | null;
  fallbackBody?: string;
  customerName?: string | null;
}): Promise<PreparedMetaTemplateSend> {
  const templateName = normalizeWhatsAppTemplateName(opts.templateName);

  const languageCode = await resolveMetaTemplateLanguage({
    templateName,
    storedLanguage: opts.storedLanguage,
    metaTemplateId: opts.metaTemplateId,
  });

  const metaRow = await findMetaTemplateRow({
    templateName,
    metaTemplateId: opts.metaTemplateId,
    languageCode,
  });

  const metaComponents = metaRow?.components ?? [];
  const bodyFromMeta = extractBodyText(metaComponents) || metaRow?.body || "";
  const bodyWithPlaceholders =
    bodyFromMeta ||
    (opts.fallbackBody && countTemplateVariables(opts.fallbackBody) > 0 ? opts.fallbackBody : null) ||
    opts.fallbackBody ||
    "";

  const components =
    metaComponents.length > 0
      ? buildMetaSendComponentsFromDefinition(metaComponents, opts.customerName)
      : undefined;

  let variableCount = countTemplateVariables(bodyWithPlaceholders);
  if (metaComponents.length > 0) {
    variableCount = 0;
    for (const raw of metaComponents) {
      const text = (raw as MetaComponentDef).text ?? "";
      variableCount += countTemplateVariables(text);
    }
  }

  return {
    templateName,
    languageCode,
    components,
    bodyWithPlaceholders,
    variableCount,
  };
}

/** Send template; retries alternate language codes if Meta returns translation error. */
export async function sendMetaTemplateWithLanguageFallback(
  phone: string,
  prepared: PreparedMetaTemplateSend
): Promise<{ sid: string; languageUsed: string }> {
  const languagesToTry = [
    prepared.languageCode,
    ...(await listLanguagesForMetaTemplate(prepared.templateName)),
  ];
  const tried = new Set<string>();
  let lastError: Error | null = null;

  for (const lang of languagesToTry) {
    const code = lang.trim();
    if (!code || tried.has(code)) continue;
    tried.add(code);

    try {
      const result = await sendWhatsAppTemplateMessage(phone, {
        templateName: prepared.templateName,
        languageCode: code,
        components: prepared.components,
      });
      return { sid: result.sid, languageUsed: code };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = e instanceof Error ? e : new Error(msg);
      const translationMissing =
        msg.includes("132001") || msg.includes("does not exist in the translation");
      const paramMismatch =
        msg.includes("132000") || msg.includes("132005") || msg.includes("parameter");
      if (!translationMissing && !paramMismatch) {
        throw lastError;
      }
      if (paramMismatch && prepared.components?.length) {
        try {
          const result = await sendWhatsAppTemplateMessage(phone, {
            templateName: prepared.templateName,
            languageCode: code,
            components: undefined,
          });
          return { sid: result.sid, languageUsed: code };
        } catch {
          /* try next language */
        }
      }
    }
  }

  throw lastError ?? new Error("Template send failed");
}
