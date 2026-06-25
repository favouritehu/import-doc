import { describe, expect, it } from 'vitest';
import { SEED_FILES } from '../data/seed';
import { railItem, railItems, type RailStatus } from '../lib/rail';
import type { ImportFile } from '../types';

const RANK: Record<RailStatus, number> = { red: 0, amber: 1, green: 2, none: 3 };
const today = '2026-06-25';
const mk = (over: Partial<ImportFile>): ImportFile => ({ ...SEED_FILES[0], arrivedOn: null, ...over });

describe('railItems', () => {
  it('returns one row per file, each with a party name + file number', () => {
    const items = railItems(SEED_FILES, today);
    expect(items).toHaveLength(SEED_FILES.length);
    expect(items.every((i) => i.party.length > 0 && i.fileNumber.startsWith('IMP-'))).toBe(true);
  });

  it('ranks urgent (red) before safe (green) before no-date', () => {
    const items = railItems(SEED_FILES, today);
    for (let i = 1; i < items.length; i += 1) {
      expect(RANK[items[i].status]).toBeGreaterThanOrEqual(RANK[items[i - 1].status]);
    }
  });
});

describe('railItem — arrival driven', () => {
  it('is green + safe when arrival is far away', () => {
    const it1 = railItem(mk({ eta: '2026-07-05' }), today); // +10 days
    expect(it1.status).toBe('green');
    expect(it1.line).toBe('Arrives in 10 days');
  });

  it('turns urgent (red) within 4 days of arrival', () => {
    const it2 = railItem(mk({ eta: '2026-06-27' }), today); // +2 days
    expect(it2.status).toBe('red');
    expect(it2.line).toBe('Arrives in 2 days');
  });

  it('is red + overdue past the arrival date', () => {
    const it3 = railItem(mk({ eta: '2026-06-20' }), today); // -5 days
    expect(it3.status).toBe('red');
    expect(it3.line).toBe('Overdue 5 days');
  });

  it('is green + done once arrived', () => {
    const it4 = railItem(mk({ eta: '2026-06-20', arrivedOn: '2026-06-22' }), today);
    expect(it4.status).toBe('green');
    expect(it4.line).toBe('Arrived');
  });

  it('is neutral when no arrival date is set', () => {
    const it5 = railItem(mk({ eta: '' }), today);
    expect(it5.status).toBe('none');
    expect(it5.line).toBe('No arrival date');
  });
});
