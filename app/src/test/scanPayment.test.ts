import { describe, it, expect } from 'vitest';
import { interpretScan } from '../lib/scanPayment';

describe('interpretScan', () => {
  it('amount > 0 → returns amount + currency + verify note', () => {
    const out = interpretScan({ amount: 51234.5, currency: 'INR', ref: 'BE123' }, 'Bill of Entry');
    expect(out.amount).toBe('51234.5');
    expect(out.currency).toBe('INR');
    expect(out.note).toBe('Read from Bill of Entry — verify before saving.');
  });

  it('amount === 0 → note-only "enter manually", no amount/currency', () => {
    const out = interpretScan({ amount: 0, currency: 'INR', ref: '' }, 'Bill of Entry');
    expect(out.amount).toBeUndefined();
    expect(out.currency).toBeUndefined();
    expect(out.note).toBe("Couldn't read an amount — enter it manually.");
  });

  it('negative amount → note-only "enter manually"', () => {
    const out = interpretScan({ amount: -5, currency: 'USD', ref: '' }, 'FIRC/BRC');
    expect(out.amount).toBeUndefined();
    expect(out.note).toBe("Couldn't read an amount — enter it manually.");
  });

  it('null-ish result → note-only "enter manually"', () => {
    const out = interpretScan(null as any, 'Freight Invoice');
    expect(out.amount).toBeUndefined();
    expect(out.note).toBe("Couldn't read an amount — enter it manually.");
  });
});
