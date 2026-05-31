import { query } from "../db/pool.js";
import {
  computeRechargeDueDate,
  mergeRechargeIntoCustomFields,
  parseBillingCycle,
  parseISODate,
  type BillingCycle,
} from "./billingCycle.js";

export async function getVendorBillingCycle(vendorId: string): Promise<BillingCycle> {
  const r = await query<{ billing_cycle: string }>(
    `SELECT billing_cycle FROM vendors WHERE id = $1`,
    [vendorId]
  );
  return parseBillingCycle(r.rows[0]?.billing_cycle);
}

export function resolveSubscriberDates(opts: {
  joining_date: string | null | undefined;
  billing_cycle: BillingCycle;
  existing_recharge_date?: string | null;
}): { joining_date: string | null; recharge_date: string | null } {
  const joining = parseISODate(opts.joining_date);
  if (!joining) {
    return { joining_date: null, recharge_date: parseISODate(opts.existing_recharge_date) };
  }
  const recharge = computeRechargeDueDate(joining, opts.billing_cycle);
  return { joining_date: joining, recharge_date: recharge };
}

export async function applyCustomerBillingFields(
  vendorId: string,
  joiningDateInput: string | null | undefined,
  customFields: Record<string, unknown> = {}
): Promise<{
  joining_date: string | null;
  recharge_date: string | null;
  custom_fields: Record<string, unknown>;
}> {
  const cycle = await getVendorBillingCycle(vendorId);
  const joining =
    parseISODate(joiningDateInput) ?? parseISODate(customFields.joining_date) ?? null;
  const { joining_date, recharge_date } = resolveSubscriberDates({
    joining_date: joining,
    billing_cycle: cycle,
  });
  return {
    joining_date,
    recharge_date,
    custom_fields: mergeRechargeIntoCustomFields(customFields, joining_date, recharge_date),
  };
}
