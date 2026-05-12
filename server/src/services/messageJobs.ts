import { query } from "../db/pool.js";
import { config } from "../config.js";
import { buildCustomerWhereFromFilters } from "./customerFilters.js";

export async function enqueueOutboundMessage(logId: string): Promise<void> {
  if (config.skipRedis) {
    const { processOutboundMessage } = await import("./processOutboundMessage.js");
    await processOutboundMessage(logId);
    return;
  }
  const { whatsappQueue } = await import("../jobs/queues.js");
  await whatsappQueue.add("send", { logId }, { jobId: logId });
}

export async function resolveTemplateBody(
  vendorId: string,
  templateId: string | undefined,
  explicitBody: string | undefined
): Promise<string> {
  if (explicitBody?.trim()) return explicitBody;
  if (!templateId) throw new Error("Provide body or template_id");
  const r = await query<{ body: string }>(
    `SELECT body FROM message_templates WHERE vendor_id = $1 AND id = $2`,
    [vendorId, templateId]
  );
  if (r.rows.length === 0) throw new Error("Template not found");
  return r.rows[0].body;
}

export async function resolveRecipientPhones(
  vendorId: string,
  opts: {
    customer_ids?: string[];
    group_id?: string;
    filters?: Record<string, unknown>;
  }
): Promise<{ id: string; phone: string }[]> {
  if (opts.customer_ids?.length) {
    const r = await query<{ id: string; phone: string }>(
      `SELECT id, phone FROM customers WHERE vendor_id = $1 AND id = ANY($2::uuid[])`,
      [vendorId, opts.customer_ids]
    );
    return r.rows;
  }

  if (opts.group_id) {
    const g = await query<{ filters: Record<string, unknown> }>(
      `SELECT filters FROM dynamic_groups WHERE vendor_id = $1 AND id = $2`,
      [vendorId, opts.group_id]
    );
    if (g.rows.length === 0) throw new Error("Group not found");
    const built = buildCustomerWhereFromFilters(vendorId, g.rows[0].filters);
    const r = await query<{ id: string; phone: string }>(
      `SELECT id, phone FROM customers WHERE ${built.whereClause}`,
      built.params
    );
    return r.rows;
  }

  const filters = opts.filters ?? {};
  const built = buildCustomerWhereFromFilters(vendorId, filters);
  const r = await query<{ id: string; phone: string }>(
    `SELECT id, phone FROM customers WHERE ${built.whereClause}`,
    built.params
  );
  return r.rows;
}
