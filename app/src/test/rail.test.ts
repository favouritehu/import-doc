import { describe, expect, it } from 'vitest';
import { SEED_FILES } from '../data/seed';
import { railItems, type RailStatus } from '../lib/rail';

const RANK: Record<RailStatus, number> = { red: 0, amber: 1, green: 2, none: 3 };

describe('railItems', () => {
  const today = '2026-06-25';

  it('returns one row per file, each with a party name + file number', () => {
    const items = railItems(SEED_FILES, today);
    expect(items).toHaveLength(SEED_FILES.length);
    expect(items.every((i) => i.party.length > 0 && i.fileNumber.startsWith('IMP-'))).toBe(true);
  });

  it('ranks red before amber before green/none', () => {
    const items = railItems(SEED_FILES, today);
    for (let i = 1; i < items.length; i += 1) {
      expect(RANK[items[i].status]).toBeGreaterThanOrEqual(RANK[items[i - 1].status]);
    }
  });

  it('flags an overdue payment as red', () => {
    const f = { ...SEED_FILES[0], payments: [{ type: 'advance', due: '', paid: null, status: 'overdue', ref: '' }] } as (typeof SEED_FILES)[number];
    const [item] = railItems([f], today);
    expect(item.status).toBe('red');
    expect(item.line).toBe('Payment overdue');
  });
});
