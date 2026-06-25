// Pure date helpers. Dates are local calendar dates (YYYY-MM-DD); no timezone
// handling beyond "local day". `parseDate` is lenient so legacy seed values
// ("08 Jun 2026") and user input (dd/mm/yyyy) both round-trip with fmtDate.
// All differencing is done on a UTC-midnight basis so the parse format can never
// leak an off-by-one across the amber/red boundary.

const MS_PER_DAY = 86_400_000;

/** Local date today as ISO YYYY-MM-DD (real Date — app code, OK). */
export function todayIso(): string {
  return isoOf(new Date());
}

/** ISO YYYY-MM-DD for a Date, using its LOCAL calendar fields. */
export function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC-midnight epoch ms for a calendar (y, m1-based, d). */
function utcDay(y: number, m1: number, d: number): number {
  return Date.UTC(y, m1 - 1, d);
}

/**
 * Lenient parse to a UTC-midnight Date.
 *  - '' / null / undefined            -> null
 *  - ISO  YYYY-MM-DD                   -> exact
 *  - dd/mm/yyyy and dd-mm-yyyy         -> exact (day-first, Indian convention)
 *  - anything else (e.g. "08 Jun 2026") -> native Date fallback, null if NaN
 * Returned Date is UTC midnight so daysBetween is format/DST agnostic.
 */
export function parseDate(s?: string | null): Date | null {
  if (s == null) return null;
  const str = s.trim();
  if (str === '') return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(str);
  if (iso) {
    return new Date(utcDay(+iso[1], +iso[2], +iso[3]));
  }

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str);
  if (dmy) {
    return new Date(utcDay(+dmy[3], +dmy[2], +dmy[1]));
  }

  // Fallback: native parse (handles "08 Jun 2026", "Jun 8 2026", etc.).
  const native = new Date(str);
  if (Number.isNaN(native.getTime())) return null;
  // Re-anchor the native (local) calendar day to UTC midnight.
  return new Date(utcDay(native.getFullYear(), native.getMonth() + 1, native.getDate()));
}

/** Whole days from -> to (to minus from). null if either side is unparseable. */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = parseDate(fromIso);
  const b = parseDate(toIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Display date e.g. "02 Jul 2026"; '' if unparseable. */
export function fmtDate(s?: string | null): string {
  const d = parseDate(s);
  if (!d) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** One calendar cell in a month matrix. */
export interface MonthCell {
  iso: string; // YYYY-MM-DD
  day: number; // 1..31
  inMonth: boolean; // false for leading/trailing days from adjacent months
}

/**
 * 6x7 month matrix (always 42 cells) for `month` (1-based) of `year`. Weeks
 * start Monday. Leading/trailing days come from the adjacent months with
 * `inMonth: false`. Used by the Calendar screen (Phase 4).
 */
export function monthMatrix(year: number, month: number): MonthCell[][] {
  const first = new Date(utcDay(year, month, 1));
  // JS getUTCDay: 0=Sun..6=Sat. Shift to Monday-first (0=Mon..6=Sun).
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - lead * MS_PER_DAY);

  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start.getTime() + (w * 7 + d) * MS_PER_DAY);
      week.push({
        iso: isoOfUtc(cur),
        day: cur.getUTCDate(),
        inMonth: cur.getUTCMonth() + 1 === month && cur.getUTCFullYear() === year,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** ISO YYYY-MM-DD from a UTC-anchored Date (used by monthMatrix). */
function isoOfUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
