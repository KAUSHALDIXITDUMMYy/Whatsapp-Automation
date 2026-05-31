import { query } from "../db/pool.js";
import {
  sendFlowText,
  sendListMessage,
  sendReplyButtons,
} from "./whatsappInteractive.js";

export const FLOW_SCHEDULE_VISIT = "flow_schedule_visit";
export const FLOW_SCHEDULE_CALL = "flow_schedule_call";
export const FLOW_CHAT_TECH = "flow_chat_tech";

type CustomerRow = {
  id: string;
  vendor_id: string;
  name: string;
  phone: string;
};

type FlowType = "visit" | "call";

type InboundPayload = {
  text: string;
  buttonId: string | null;
  listId: string | null;
};

type VendorFlowSettings = {
  appointment_slot_times: string[];
  appointment_days_ahead: number;
  whatsapp_menu_greeting: string | null;
  company_name: string;
};

function parseInboundPayload(msg: Record<string, unknown>): InboundPayload {
  const type = String(msg.type ?? "text");
  if (type === "interactive") {
    const i = msg.interactive as {
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    if (i?.button_reply?.id) {
      return { text: i.button_reply.title ?? "", buttonId: i.button_reply.id, listId: null };
    }
    if (i?.list_reply?.id) {
      return { text: i.list_reply.title ?? "", buttonId: null, listId: i.list_reply.id };
    }
  }
  if (type === "text") {
    const t = msg.text as { body?: string };
    return { text: (t?.body ?? "").trim(), buttonId: null, listId: null };
  }
  return { text: "", buttonId: null, listId: null };
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00.000Z");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

function upcomingDates(daysAhead: number): string[] {
  const out: string[] = [];
  const start = new Date();
  start.setUTCHours(12, 0, 0, 0);
  for (let i = 1; i <= daysAhead; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function customerHasChatTag(customerId: string): Promise<boolean> {
  const r = await query<{ tags: unknown }>(`SELECT tags FROM customers WHERE id = $1`, [customerId]);
  const tags = (r.rows[0]?.tags as string[]) ?? [];
  return tags.includes("whatsapp_chat_active");
}

async function getVendorFlowSettings(vendorId: string): Promise<VendorFlowSettings> {
  const r = await query<{
    appointment_slot_times: unknown;
    appointment_days_ahead: number;
    whatsapp_menu_greeting: string | null;
    company_name: string;
  }>(
    `SELECT appointment_slot_times, appointment_days_ahead, whatsapp_menu_greeting, company_name
     FROM vendors WHERE id = $1`,
    [vendorId]
  );
  const row = r.rows[0];
  let times: string[] = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
  if (Array.isArray(row?.appointment_slot_times)) {
    times = row.appointment_slot_times.filter((t): t is string => typeof t === "string" && t.length > 0);
  }
  return {
    appointment_slot_times: times,
    appointment_days_ahead: row?.appointment_days_ahead ?? 7,
    whatsapp_menu_greeting: row?.whatsapp_menu_greeting ?? null,
    company_name: row?.company_name ?? "Cable support",
  };
}

async function setSession(
  customerId: string,
  vendorId: string,
  state: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await query(
    `INSERT INTO customer_whatsapp_sessions (customer_id, vendor_id, state, payload, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (customer_id) DO UPDATE SET
       state = EXCLUDED.state,
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [customerId, vendorId, state, JSON.stringify(payload)]
  );
}

async function clearSession(customerId: string): Promise<void> {
  await query(`DELETE FROM customer_whatsapp_sessions WHERE customer_id = $1`, [customerId]);
}

async function getSession(
  customerId: string
): Promise<{ state: string; payload: Record<string, unknown> } | null> {
  const r = await query<{ state: string; payload: Record<string, unknown> }>(
    `SELECT state, payload FROM customer_whatsapp_sessions WHERE customer_id = $1`,
    [customerId]
  );
  return r.rows[0] ?? null;
}

async function showServicesMenu(customer: CustomerRow, settings: VendorFlowSettings): Promise<void> {
  const greeting =
    settings.whatsapp_menu_greeting?.trim() ||
    `Hello! Welcome to ${settings.company_name}.\n\nChoose a service:`;

  await sendReplyButtons(
    customer.phone,
    greeting,
    [
      { id: FLOW_SCHEDULE_VISIT, title: "Book technician" },
      { id: FLOW_SCHEDULE_CALL, title: "Schedule a call" },
      { id: FLOW_CHAT_TECH, title: "Chat technician" },
    ],
    { vendorId: customer.vendor_id, customerId: customer.id }
  );
  await clearSession(customer.id);
}

async function showDatePicker(
  customer: CustomerRow,
  settings: VendorFlowSettings,
  flowType: FlowType
): Promise<void> {
  const prefix = flowType === "call" ? "call_d_" : "sch_d_";
  const label =
    flowType === "call"
      ? "Choose a date for a technician to call you:"
      : "Choose a date for your technician visit:";

  const dates = upcomingDates(Math.min(settings.appointment_days_ahead, 10));
  await sendListMessage(
    customer.phone,
    label,
    "Pick date",
    [
      {
        title: "Available dates",
        rows: dates.map((iso) => ({
          id: `${prefix}${iso}`,
          title: formatDateLabel(iso),
          description: iso,
        })),
      },
    ],
    { vendorId: customer.vendor_id, customerId: customer.id }
  );
  await setSession(customer.id, customer.vendor_id, "pick_date", { flowType });
}

async function showTimeSlots(
  customer: CustomerRow,
  dateIso: string,
  settings: VendorFlowSettings,
  flowType: FlowType
): Promise<void> {
  const prefix = flowType === "call" ? "call_t_" : "sch_t_";
  const rows = settings.appointment_slot_times.map((t) => ({
    id: `${prefix}${dateIso}|${t}`,
    title: t,
    description: formatDateLabel(dateIso),
  }));

  if (rows.length === 0) {
    await sendFlowText(
      customer.phone,
      "No time slots configured. Please contact support.",
      { vendorId: customer.vendor_id, customerId: customer.id }
    );
    await showServicesMenu(customer, settings);
    return;
  }

  const label =
    flowType === "call"
      ? `Select a time for your call on ${formatDateLabel(dateIso)}:`
      : `Select a visit time for ${formatDateLabel(dateIso)}:`;

  await sendListMessage(
    customer.phone,
    label,
    "Pick time",
    [{ title: "Time slots", rows: rows.slice(0, 10) }],
    { vendorId: customer.vendor_id, customerId: customer.id }
  );
  await setSession(customer.id, customer.vendor_id, "pick_time", { flowType, date: dateIso });
}

async function confirmVisit(
  customer: CustomerRow,
  dateIso: string,
  time: string,
  settings: VendorFlowSettings
): Promise<void> {
  const dup = await query(
    `SELECT id FROM technician_appointments
     WHERE vendor_id = $1 AND customer_id = $2 AND appointment_date = $3
       AND appointment_time = $4 AND status = 'scheduled'`,
    [customer.vendor_id, customer.id, dateIso, time]
  );
  if (dup.rows.length === 0) {
    await query(
      `INSERT INTO technician_appointments (vendor_id, customer_id, appointment_date, appointment_time, status)
       VALUES ($1, $2, $3, $4, 'scheduled')`,
      [customer.vendor_id, customer.id, dateIso, time]
    );
  }

  await query(`INSERT INTO vendor_dashboard_reminders (vendor_id, message) VALUES ($1, $2)`, [
    customer.vendor_id,
    `Technician visit: ${customer.name} (${customer.phone}) on ${formatDateLabel(dateIso)} at ${time}.`,
  ]);

  await sendFlowText(
    customer.phone,
    `Visit confirmed for ${formatDateLabel(dateIso)} at ${time}. Our technician team will see you then.`,
    { vendorId: customer.vendor_id, customerId: customer.id }
  );
  await clearSession(customer.id);
  await showServicesMenu(customer, settings);
}

async function confirmCall(
  customer: CustomerRow,
  dateIso: string,
  time: string,
  settings: VendorFlowSettings
): Promise<void> {
  await query(
    `INSERT INTO technician_call_requests (vendor_id, customer_id, preferred_date, preferred_time, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [customer.vendor_id, customer.id, dateIso, time]
  );

  await query(`INSERT INTO vendor_dashboard_reminders (vendor_id, message) VALUES ($1, $2)`, [
    customer.vendor_id,
    `Call request: ${customer.name} (${customer.phone}) — preferred ${formatDateLabel(dateIso)} at ${time}. Call when convenient.`,
  ]);

  await sendFlowText(
    customer.phone,
    `Call request received for ${formatDateLabel(dateIso)} around ${time}. Our technician will call you on WhatsApp or phone.`,
    { vendorId: customer.vendor_id, customerId: customer.id }
  );
  await clearSession(customer.id);
  await showServicesMenu(customer, settings);
}

async function handleChatTechnician(customer: CustomerRow): Promise<void> {
  const cur = await query<{ tags: unknown }>(`SELECT tags FROM customers WHERE id = $1`, [customer.id]);
  const tags = new Set<string>((cur.rows[0]?.tags as string[]) ?? []);
  tags.add("whatsapp_chat_active");

  await query(`UPDATE customers SET tags = $1::jsonb, updated_at = NOW() WHERE id = $2`, [
    JSON.stringify([...tags]),
    customer.id,
  ]);

  await query(`INSERT INTO vendor_dashboard_reminders (vendor_id, message) VALUES ($1, $2)`, [
    customer.vendor_id,
    `Chat with technician: ${customer.name} (${customer.phone}) is waiting on WhatsApp. Open Chats in your dashboard.`,
  ]);

  await sendFlowText(
    customer.phone,
    `You are connected for chat. Type your issue below and our technician will reply here on WhatsApp.`,
    { vendorId: customer.vendor_id, customerId: customer.id }
  );
  await clearSession(customer.id);
}

function isMenuTrigger(text: string): boolean {
  const t = text.toLowerCase().trim();
  return ["hi", "hello", "hey", "menu", "help", "start", "services", "options"].includes(t);
}

function flowTypeFromSession(session: { payload: Record<string, unknown> } | null): FlowType {
  return session?.payload?.flowType === "call" ? "call" : "visit";
}

/** Cable subscriber self-service after inbound WhatsApp message. */
export async function processCustomerWhatsAppFlow(
  customer: CustomerRow,
  msg: Record<string, unknown>
): Promise<void> {
  const payload = parseInboundPayload(msg);
  const actionId = payload.buttonId ?? payload.listId;
  const settings = await getVendorFlowSettings(customer.vendor_id);
  const session = await getSession(customer.id);
  const flowType = flowTypeFromSession(session);

  const inChat = await customerHasChatTag(customer.id);
  if (inChat && !actionId?.startsWith("flow_") && !isMenuTrigger(payload.text)) {
    return;
  }

  if (actionId === FLOW_SCHEDULE_VISIT) {
    await showDatePicker(customer, settings, "visit");
    return;
  }
  if (actionId === FLOW_SCHEDULE_CALL) {
    await showDatePicker(customer, settings, "call");
    return;
  }
  if (actionId === FLOW_CHAT_TECH) {
    await handleChatTechnician(customer);
    return;
  }

  if (isMenuTrigger(payload.text)) {
    await showServicesMenu(customer, settings);
    return;
  }

  if (actionId?.startsWith("sch_d_") || actionId?.startsWith("call_d_")) {
    const prefix = actionId.startsWith("call_d_") ? "call_d_" : "sch_d_";
    const ft: FlowType = actionId.startsWith("call_d_") ? "call" : "visit";
    const dateIso = actionId.slice(prefix.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      await showTimeSlots(customer, dateIso, settings, ft);
    }
    return;
  }

  if (actionId?.startsWith("sch_t_") || actionId?.startsWith("call_t_")) {
    const isCall = actionId.startsWith("call_t_");
    const rest = actionId.slice(isCall ? "call_t_".length : "sch_t_".length);
    const pipe = rest.indexOf("|");
    if (pipe > 0) {
      const dateIso = rest.slice(0, pipe);
      const time = rest.slice(pipe + 1);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso) && time) {
        if (isCall) await confirmCall(customer, dateIso, time, settings);
        else await confirmVisit(customer, dateIso, time, settings);
      }
    }
    return;
  }

  if (session?.state === "pick_date" || session?.state === "pick_time") {
    await sendFlowText(customer.phone, "Please choose an option from the list above.", {
      vendorId: customer.vendor_id,
      customerId: customer.id,
    });
    return;
  }

  await showServicesMenu(customer, settings);
}

export { parseInboundPayload };
