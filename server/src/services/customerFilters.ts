/**
 * Build SQL WHERE clause for vendor-scoped customer filters (tags + custom_fields JSONB).
 */
export function buildCustomerWhereFromFilters(
  vendorId: string,
  filters: Record<string, unknown>
): { whereClause: string; params: unknown[] } {
  const conditions: string[] = ["vendor_id = $1"];
  const params: unknown[] = [vendorId];
  let i = 2;

  const tags = filters.tags as string[] | undefined;
  const tagMode = (filters.tag_mode as string) || "any";
  const customFields = filters.custom_fields as Record<string, string> | undefined;

  if (tags && tags.length > 0) {
    if (tagMode === "all") {
      for (const t of tags) {
        conditions.push(`tags @> $${i}::jsonb`);
        params.push(JSON.stringify([t]));
        i++;
      }
    } else {
      const ors: string[] = [];
      for (const t of tags) {
        ors.push(`tags @> $${i}::jsonb`);
        params.push(JSON.stringify([t]));
        i++;
      }
      conditions.push(`(${ors.join(" OR ")})`);
    }
  }

  if (customFields) {
    for (const [k, v] of Object.entries(customFields)) {
      conditions.push(`custom_fields @> $${i}::jsonb`);
      params.push(JSON.stringify({ [k]: v }));
      i++;
    }
  }

  return { whereClause: conditions.join(" AND "), params };
}
