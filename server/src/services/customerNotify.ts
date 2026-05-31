import { query } from "../db/pool.js";
import { sendFlowText } from "./whatsappInteractive.js";

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00.000Z");
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

/** Notify subscriber of rescheduled technician visit (session message). */
export async function notifyVisitRescheduled(opts: {
  vendorId: string;
  customerId: string;
  phone: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
}): Promise<void> {
  const body = `Your technician visit has been rescheduled.\n\nPreviously: ${formatDateLabel(opts.oldDate)} at ${opts.oldTime}\nNew slot: ${formatDateLabel(opts.newDate)} at ${opts.newTime}\n\nReply Hi if you need to change again.`;

  try {
    await sendFlowText(opts.phone, body, {
      vendorId: opts.vendorId,
      customerId: opts.customerId,
    });
  } catch (e) {
    console.error("[notify] visit reschedule failed", e);
    await query(
      `INSERT INTO messages_log (vendor_id, customer_id, phone, body, status, direction, provider_error)
       VALUES ($1, $2, $3, $4, 'failed', 'outbound', $5)`,
      [
        opts.vendorId,
        opts.customerId,
        opts.phone,
        body,
        e instanceof Error ? e.message : String(e),
      ]
    );
  }
}
