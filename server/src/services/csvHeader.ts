import { parse } from "csv-parse/sync";

const MAX_SCAN_ROWS = 40;

const HEADER_HINTS = [
  /\bname\b/i,
  /\bcustomer\b/i,
  /\bphone\b/i,
  /\bmobile\b/i,
  /\bm\.?\s*o\.?\s*n\.?\b/i,
  /\bmo\.?\s*n\.?\s*o\.?\b/i,
  /\bstb\b/i,
  /\bdate\b/i,
  /\bamount\b/i,
  /\bbalance\b/i,
  /\bpackage/i,
  /\bpack/i,
  /\bemail\b/i,
  /\bcard\b/i,
  /\bplan\b/i,
  /^no\.?$/i,
  /\bserial\b/i,
];

function nonEmptyCount(cells: string[]): number {
  return cells.filter((c) => String(c).trim().length > 0).length;
}

function scoreHeaderRow(cells: string[]): number {
  const trimmed = cells.map((c) => String(c ?? "").trim());
  const n = nonEmptyCount(trimmed);
  if (n === 0) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (n >= 4) score += 4;
  else if (n >= 3) score += 2;
  else if (n >= 2) score += 1;

  for (const cell of trimmed) {
    if (!cell) continue;
    let matched = false;
    for (const re of HEADER_HINTS) {
      if (re.test(cell)) {
        score += 5;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const looksShortLabel =
      cell.length >= 2 &&
      cell.length <= 48 &&
      /[A-Za-z]/.test(cell) &&
      !/^\d+([.,]\d+)?$/.test(cell) &&
      cell.split(/\s+/).length <= 6;
    if (looksShortLabel) score += 1;
  }

  return score;
}

export function detectHeaderRowIndex(matrix: string[][]): number {
  if (matrix.length === 0) return 0;

  const limit = Math.min(matrix.length, MAX_SCAN_ROWS);
  let bestIdx = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < limit; i++) {
    const row = matrix[i] ?? [];
    const s = scoreHeaderRow(row.map(String));
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
    }
  }

  if (bestScore < 4) return 0;

  return bestIdx;
}

function makeUniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, i) => {
    let base = String(cell).trim();
    if (!base) base = `Column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}_${n}` : base;
  });
}

export type ParsedCsvTable = {
  headers: string[];
  rows: Record<string, string>[];
  /** 0-based line index in the file (first row = 0). */
  headerRowIndex: number;
  /** 1-based row number for display (Excel-style). */
  headerRowNumberDisplay: number;
};

export function parseCsvWithDetectedHeader(csvText: string): ParsedCsvTable {
  const matrix = parse(csvText, {
    columns: false,
    skip_empty_lines: false,
    relax_column_count: true,
    trim: true,
  }) as string[][];

  if (matrix.length === 0) {
    return { headers: [], rows: [], headerRowIndex: 0, headerRowNumberDisplay: 1 };
  }

  const headerIdx = detectHeaderRowIndex(matrix);
  const headerCells = matrix[headerIdx].map((c) => String(c ?? ""));
  const headers = makeUniqueHeaders(headerCells);

  const rows: Record<string, string>[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (!line.some((c) => String(c).trim().length > 0)) continue;

    const obj: Record<string, string> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const v = String(line[c] ?? "").trim();
      if (v) any = true;
      obj[headers[c]] = v;
    }
    if (any) rows.push(obj);
  }

  return {
    headers,
    rows,
    headerRowIndex: headerIdx,
    headerRowNumberDisplay: headerIdx + 1,
  };
}
