import { describe, expect, it } from 'vitest';
import type { ImportFile } from '../types';
import { SEED_FILES } from '../data/seed';
import {
  derivePriority,
  deriveStatus,
  isRequired,
  relevantPayments,
  reqMissing,
} from '../lib/derive';
import { fileValueInr, invoiceInr } from '../lib/format';

const byId = (id: number): ImportFile => structuredClone(SEED_FILES.find((f) => f.id === id)!);

describe('deriveStatus — every ladder branch', () => {
  it('classifies each seed file at its intended stage', () => {
    const want: Record<number, string> = {
      1: 'duty_paid',
      2: 'documents_pending',
      3: 'documents_pending', // via discrepant CI
      4: 'bank_work',
      5: 'cha_work',
      6: 'goods_received',
      7: 'draft',
    };
    for (const f of SEED_FILES) {
      expect(deriveStatus(f), `file ${f.id} (${f.fileNumber})`).toBe(want[f.id]);
    }
  });

  it('statusManual short-circuits to the held status (closed)', () => {
    const f = byId(6);
    f.statusManual = true;
    f.status = 'closed';
    expect(deriveStatus(f)).toBe('closed');
  });

  it('REGRESSION: dutyPaid + ooc + do resolves to goods_received, not duty_paid', () => {
    const f = byId(1); // duty_paid with OOC pending
    expect(deriveStatus(f)).toBe('duty_paid');
    f.chaOv.out_of_charge = ['done', '17 Jun 2026'];
    f.chaOv.delivery_order = ['done', '17 Jun 2026'];
    expect(deriveStatus(f)).toBe('goods_received');
  });

  it('draft is reachable: nothing uploaded -> draft (not documents_pending)', () => {
    expect(deriveStatus(byId(7))).toBe('draft');
  });
});

describe('multi-invoice gating', () => {
  it('fileValueInr sums across all invoices', () => {
    const f5 = byId(5);
    expect(f5.invoices.length).toBe(2);
    const sum = f5.invoices.reduce((s, i) => s + invoiceInr(i), 0);
    expect(fileValueInr(f5)).toBe(sum);
    expect(fileValueInr(f5)).toBe(invoiceInr(f5.invoices[0]) + invoiceInr(f5.invoices[1]));
  });

  it('a discrepant CI on ANY invoice forces documents_pending', () => {
    const f = byId(5); // otherwise cha_work, all approved
    f.invoices[1].ci.status = 'discrepant';
    f.invoices[1].ci.reason = 'Amount mismatch';
    expect(deriveStatus(f)).toBe('documents_pending');
  });

  it('a missing CI on invoice 2 keeps reqMissing > 0 and blocks cha_work', () => {
    const f = byId(5);
    f.invoices[1].ci.status = 'missing';
    expect(reqMissing(f)).toBeGreaterThan(0);
    expect(deriveStatus(f)).not.toBe('cha_work');
  });
});

describe('isRequired — incoterm + mode', () => {
  it('CIF drops insurance and freight; CFR drops freight only; FOB keeps both', () => {
    expect(isRequired('insurance_copy', { mode: 'sea', incoterm: 'CIF' })).toBe(false);
    expect(isRequired('freight_invoice', { mode: 'sea', incoterm: 'CIF' })).toBe(false);
    expect(isRequired('freight_invoice', { mode: 'sea', incoterm: 'CFR' })).toBe(false);
    expect(isRequired('insurance_copy', { mode: 'sea', incoterm: 'CFR' })).toBe(true);
    expect(isRequired('insurance_copy', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
    expect(isRequired('freight_invoice', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
  });

  it('bank_letter and certificate_of_origin are optional; CI/PL always required', () => {
    expect(isRequired('bank_letter', { mode: 'sea', incoterm: 'FOB' })).toBe(false);
    expect(isRequired('certificate_of_origin', { mode: 'sea', incoterm: 'FOB' })).toBe(false);
    expect(isRequired('commercial_invoice', { mode: 'sea', incoterm: 'CIF' })).toBe(true);
    expect(isRequired('packing_list', { mode: 'air', incoterm: 'FOB' })).toBe(true);
  });

  it('BL is required for sea, AWB for air (swapped)', () => {
    expect(isRequired('bill_of_lading', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
    expect(isRequired('bill_of_lading', { mode: 'air', incoterm: 'FOB' })).toBe(false);
    expect(isRequired('awb', { mode: 'air', incoterm: 'FOB' })).toBe(true);
    expect(isRequired('awb', { mode: 'sea', incoterm: 'FOB' })).toBe(false);
  });
});

describe('relevantPayments — incoterm trimming', () => {
  const make = (incoterm: ImportFile['incoterm']): ImportFile => {
    const f = byId(4);
    f.incoterm = incoterm;
    f.payments = [
      { type: 'advance', usd: 100, rate: 83, currency: 'USD', due: '', paid: null, status: 'pending', ref: '' },
      { type: 'freight', inr: 1000, currency: 'INR', due: '', paid: null, status: 'pending', ref: '' },
      { type: 'insurance', inr: 500, currency: 'INR', due: '', paid: null, status: 'pending', ref: '' },
    ];
    return f;
  };
  it('CIF drops freight + insurance', () => {
    const t = relevantPayments(make('CIF')).map((p) => p.type);
    expect(t).toEqual(['advance']);
  });
  it('CFR drops freight only', () => {
    const t = relevantPayments(make('CFR')).map((p) => p.type);
    expect(t).toEqual(['advance', 'insurance']);
  });
  it('FOB keeps all', () => {
    const t = relevantPayments(make('FOB')).map((p) => p.type);
    expect(t).toEqual(['advance', 'freight', 'insurance']);
  });
});

describe('derivePriority', () => {
  it('discrepant doc -> urgent', () => {
    expect(derivePriority(byId(3))).toBe('urgent');
  });
  it('arrived + OOC pending (demurrage) -> urgent', () => {
    expect(derivePriority(byId(1))).toBe('urgent');
  });
  it('near ETA (<=3) with missing docs -> urgent', () => {
    const f = byId(2);
    f.etaDays = 2; // insurance still missing
    expect(derivePriority(f)).toBe('urgent');
  });
  it('otherwise preserves the seeded priority', () => {
    expect(derivePriority(byId(7))).toBe('normal');
  });
});
