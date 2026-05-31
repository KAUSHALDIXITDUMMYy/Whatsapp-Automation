/** Standard subscriber import / manual entry columns. */
export const SUBSCRIBER_SHEET_COLUMNS = [
  {
    key: "name",
    label: "Subscriber name",
    required: true,
    aliases: ["name", "subscriber name", "customer name", "cust name"],
  },
  {
    key: "phone",
    label: "Mobile number",
    required: true,
    aliases: ["phone", "mobile", "mob", "mo.no", "mono", "contact", "whatsapp", "cell"],
  },
  {
    key: "joining_date",
    label: "Joining date",
    required: true,
    aliases: [
      "joining date",
      "join date",
      "joining",
      "start date",
      "connection date",
      "activation date",
      "date of join",
    ],
  },
] as const;

export type SubscriberSheetFieldKey = (typeof SUBSCRIBER_SHEET_COLUMNS)[number]["key"];

export function getSheetFormatForApi() {
  return {
    columns: SUBSCRIBER_SHEET_COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
      required: c.required,
      example: c.key === "joining_date" ? "2025-01-15" : c.key === "phone" ? "+919876543210" : "Ramesh Kumar",
    })),
    notes: [
      "Due date (recharge) is calculated automatically from joining date and your billing cycle in Settings.",
      "After import, mark rent received per subscriber to stop reminders until the next period.",
      "New subscribers added manually must use the same three fields.",
    ],
  };
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s._-]+/g, " ").trim();
}

/** Auto-map CSV headers to standard subscriber columns. */
export function autoMapSubscriberHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    const compact = norm.replace(/\s/g, "");

    let matched: SubscriberSheetFieldKey | "" = "";
    for (const col of SUBSCRIBER_SHEET_COLUMNS) {
      if (col.aliases.some((a) => norm === a || norm.includes(a) || compact.includes(a.replace(/\s/g, "")))) {
        matched = col.key;
        break;
      }
    }

    if (!matched) {
      if (/\bphone\b|mobile|mono|contact/.test(norm) || compact.includes("mono")) matched = "phone";
      else if (/\bname\b/.test(norm) && !/user|file|sheet/.test(norm)) matched = "name";
      else if (/join|start|activ|connect/.test(norm) && /date|dt/.test(norm)) matched = "joining_date";
      else if (norm === "date" || norm === "dt") matched = "joining_date";
    }

    mapping[h] = matched;
  }
  return mapping;
}

export function extractSubscriberRow(
  row: Record<string, string>,
  mapping: Record<string, string>
): { name: string; phone: string; joining_date: string | null; tags: string[] } {
  let name = "";
  let phone = "";
  let joining_date: string | null = null;
  const tags: string[] = [];

  for (const [csvCol, target] of Object.entries(mapping)) {
    const cell = row[csvCol]?.trim() ?? "";
    if (!cell || !target) continue;
    if (target === "name") name = cell;
    else if (target === "phone") phone = cell.replace(/\s+/g, "");
    else if (target === "joining_date") joining_date = cell.slice(0, 10);
    else if (target === "tags") {
      tags.push(...cell.split(/[,;]/).map((t) => t.trim()).filter(Boolean));
    }
  }

  return { name, phone, joining_date, tags };
}
