export type BillingCycle = "weekly" | "biweekly" | "monthly" | "quarterly";

const VALID: BillingCycle[] = ["weekly", "biweekly", "monthly", "quarterly"];

export function parseBillingCycle(raw: string | null | undefined): BillingCycle {
  const s = (raw ?? "monthly").trim().toLowerCase();
  if (VALID.includes(s as BillingCycle)) return s as BillingCycle;
  return "monthly";
}

export function parseISODate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return s.slice(0, 10);
}

/** Add one billing period to an ISO date (UTC noon). */
export function addBillingPeriod(iso: string, cycle: BillingCycle): string {
  const d = new Date(iso + "T12:00:00.000Z");
  switch (cycle) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "biweekly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
  }
  return d.toISOString().slice(0, 10);
}

/** First recharge due date = one full period after joining. */
export function firstRechargeDueDate(joiningDate: string, cycle: BillingCycle): string {
  return addBillingPeriod(joiningDate, cycle);
}

/** Next due on or after `reference` (usually today), from joining anchor. */
export function computeRechargeDueDate(
  joiningDate: string,
  cycle: BillingCycle,
  referenceIso?: string
): string {
  const ref = referenceIso ?? new Date().toISOString().slice(0, 10);
  let due = firstRechargeDueDate(joiningDate, cycle);
  let guard = 0;
  while (due < ref && guard < 500) {
    due = addBillingPeriod(due, cycle);
    guard++;
  }
  return due;
}

/** After rent is marked paid for current `recharge_date`, advance to next period. */
export function advanceRechargeAfterPayment(
  currentDue: string,
  cycle: BillingCycle
): { rent_paid_until: string; next_recharge_date: string } {
  return {
    rent_paid_until: currentDue,
    next_recharge_date: addBillingPeriod(currentDue, cycle),
  };
}

/** Skip reminder when this due date was already marked paid. */
export function shouldSkipRechargeReminder(opts: {
  eventDate: string;
  rentPaidUntil: string | null;
}): boolean {
  if (!opts.rentPaidUntil) return false;
  return opts.eventDate <= opts.rentPaidUntil;
}

export function mergeRechargeIntoCustomFields(
  customFields: Record<string, unknown>,
  joiningDate: string | null,
  rechargeDate: string | null
): Record<string, unknown> {
  const out = { ...customFields };
  if (joiningDate) out.joining_date = joiningDate;
  if (rechargeDate) out.recharge_date = rechargeDate;
  return out;
}
