// Copied verbatim from longtale-core origin/main (20e943e7): apps/api/src/api/modules/discovery/ranking/parse-recency.ts
// Do not edit: re-copy instead (DECISIONS D48).
/**
 * Parse a raw recency/date string to an ISO date string (YYYY-MM-DD) or null.
 *
 * Handles the common formats encountered in scraped cause-signal pages:
 *   - ISO passthrough:     "2024-03-12"  → "2024-03-12"
 *   - Month [DD,] YYYY:   "April 2024"  → "2024-04-01"
 *                         "April 3, 2024"→ "2024-04-03"
 *   - Season/range YYYY-YY "2023-24 season" → "2023-01-01" (first year)
 *   - Bare year:           "2024"        → "2024-01-01"  (1900 < y < 2100)
 *   - Sentinels:           "null" / "unknown" / "" / null / non-string → null
 *   - Junk:                anything else → null
 *
 * All dates are normalised to UTC midnight — callers wrap with:
 *   const iso = parseRecencyToDate(raw);
 *   const signalDate = iso ? new Date(`${iso}T00:00:00.000Z`) : null;
 */

const MONTH_MAP: Record<string, string> = {
  january: "01",
  jan: "01",
  february: "02",
  feb: "02",
  march: "03",
  mar: "03",
  april: "04",
  apr: "04",
  may: "05",
  june: "06",
  jun: "06",
  july: "07",
  jul: "07",
  august: "08",
  aug: "08",
  september: "09",
  sep: "09",
  sept: "09",
  october: "10",
  oct: "10",
  november: "11",
  nov: "11",
  december: "12",
  dec: "12",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidYear(y: number): boolean {
  return Number.isInteger(y) && y > 1900 && y < 2100;
}

export function parseRecencyToDate(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "" || s === "null" || s === "unknown") return null;

  // 1. ISO passthrough: YYYY-MM-DD (optionally with time component)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (isValidYear(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
  }

  // 2. Season/range: YYYY-YY (e.g. "2023-24 season") → first year
  const seasonMatch = s.match(/^(\d{4})-\d{2}\b/);
  if (seasonMatch) {
    const y = parseInt(seasonMatch[1], 10);
    if (isValidYear(y)) return `${seasonMatch[1]}-01-01`;
  }

  // 3. Month [DD,] YYYY  e.g. "April 2024", "April 3, 2024", "Apr 12 2023"
  const monthYearMatch = s.match(
    /^([A-Za-z]+)\s+(?:(\d{1,2})[,\s]+)?(\d{4})\b/,
  );
  if (monthYearMatch) {
    const monthKey = monthYearMatch[1].toLowerCase();
    const monthNum = MONTH_MAP[monthKey];
    if (monthNum) {
      const y = parseInt(monthYearMatch[3], 10);
      const d = monthYearMatch[2] ? parseInt(monthYearMatch[2], 10) : 1;
      if (isValidYear(y) && d >= 1 && d <= 31) {
        return `${y}-${monthNum}-${pad2(d)}`;
      }
    }
  }

  // 4. Bare year: "2024"
  const bareYearMatch = s.match(/^(\d{4})$/);
  if (bareYearMatch) {
    const y = parseInt(bareYearMatch[1], 10);
    if (isValidYear(y)) return `${y}-01-01`;
  }

  return null;
}
