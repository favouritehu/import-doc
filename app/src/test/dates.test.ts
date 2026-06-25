import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  fmtDate,
  isoOf,
  monthMatrix,
  parseDate,
} from '../lib/dates';

describe('parseDate — lenient', () => {
  it('parses ISO YYYY-MM-DD', () => {
    const d = parseDate('2026-07-02');
    expect(d).not.toBeNull();
    expect(fmtDate('2026-07-02')).toBe('02 Jul 2026');
  });

  it('parses dd/mm/yyyy and dd-mm-yyyy (day-first)', () => {
    expect(fmtDate('02/07/2026')).toBe('02 Jul 2026');
    expect(fmtDate('02-07-2026')).toBe('02 Jul 2026');
    // 13 must be the day, not the month
    expect(fmtDate('13/06/2026')).toBe('13 Jun 2026');
  });

  it('parses the legacy "DD Mon YYYY" seed format via native fallback', () => {
    expect(parseDate('08 Jun 2026')).not.toBeNull();
    expect(fmtDate('08 Jun 2026')).toBe('08 Jun 2026'); // round-trips
  });

  it('round-trips fmtDate output back through parseDate', () => {
    const pretty = fmtDate('2026-12-31');
    expect(pretty).toBe('31 Dec 2026');
    expect(fmtDate(pretty)).toBe('31 Dec 2026');
  });

  it('returns null for empty, whitespace, null, undefined, and junk', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate('   ')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('daysBetween — sign + null', () => {
  it('is positive when to is after from', () => {
    expect(daysBetween('2026-06-01', '2026-06-04')).toBe(3);
  });
  it('is negative when to is before from', () => {
    expect(daysBetween('2026-06-04', '2026-06-01')).toBe(-3);
  });
  it('is 0 for the same day', () => {
    expect(daysBetween('2026-06-04', '2026-06-04')).toBe(0);
  });
  it('is format-agnostic (no off-by-one across ISO vs DD Mon YYYY)', () => {
    expect(daysBetween('2026-06-08', '08 Jun 2026')).toBe(0);
    expect(daysBetween('08 Jun 2026', '2026-06-11')).toBe(3);
  });
  it('crosses a month boundary correctly', () => {
    expect(daysBetween('2026-06-29', '2026-07-02')).toBe(3);
  });
  it('returns null when either side is unparseable', () => {
    expect(daysBetween('', '2026-06-01')).toBeNull();
    expect(daysBetween('2026-06-01', 'junk')).toBeNull();
  });
});

describe('fmtDate', () => {
  it('returns empty string for unparseable input', () => {
    expect(fmtDate('')).toBe('');
    expect(fmtDate(null)).toBe('');
    expect(fmtDate('xyz')).toBe('');
  });
});

describe('isoOf', () => {
  it('formats a local Date to YYYY-MM-DD', () => {
    // construct via local fields so isoOf reads the same calendar day
    const d = new Date(2026, 6, 2); // month is 0-based -> July
    expect(isoOf(d)).toBe('2026-07-02');
  });
});

describe('monthMatrix', () => {
  it('always returns 6 weeks of 7 days', () => {
    const m = monthMatrix(2026, 7);
    expect(m).toHaveLength(6);
    for (const week of m) expect(week).toHaveLength(7);
  });

  it('weeks start Monday and the 1st lands in the right column', () => {
    // 1 Jul 2026 is a Wednesday -> Monday-first index 2
    const m = monthMatrix(2026, 7);
    const flat = m.flat();
    const firstOfMonth = flat.find((c) => c.inMonth && c.day === 1)!;
    const idx = flat.indexOf(firstOfMonth);
    expect(idx % 7).toBe(2); // Mon=0, Tue=1, Wed=2
    expect(firstOfMonth.iso).toBe('2026-07-01');
  });

  it('flags leading/trailing adjacent-month days as inMonth=false', () => {
    const m = monthMatrix(2026, 7);
    const flat = m.flat();
    expect(flat[0].inMonth).toBe(false); // a late-June day
    expect(flat[flat.length - 1].inMonth).toBe(false); // an early-Aug day
    expect(flat.filter((c) => c.inMonth)).toHaveLength(31); // July has 31 days
  });
});
