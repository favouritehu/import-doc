import { describe, expect, it } from 'vitest';
import type { ExportFile } from '../types';
import { EXPORT_SEED_FILES } from '../data/exportSeed';
import {
  derivePriorityExport,
  deriveExportStatus,
  isRequiredExport,
  reqMissingExport,
} from '../lib/deriveExport';
import { buyerLabel, distinctBuyers, exportValueInr } from '../lib/format';

const byId = (id: number): ExportFile => structuredClone(EXPORT_SEED_FILES.find((f) => f.id === id)!);

describe('deriveExportStatus — every ladder branch', () => {
  it('classifies each seed file at its intended stage', () => {
    const want: Record<number, string> = {
      1: 'customs_cleared',
      2: 'documents_pending', // via discrepant CI
      3: 'cha_work',
      4: 'cha_work', // multi-invoice
      5: 'shipped',
      6: 'payment_realized',
      7: 'draft',
    };
    for (const f of EXPORT_SEED_FILES) {
      expect(deriveExportStatus(f), `file ${f.id} (${f.fileNumber})`).toBe(want[f.id]);
    }
  });

  it('statusManual short-circuits to the held status (closed)', () => {
    const f = byId(6);
    f.statusManual = true;
    f.status = 'closed';
    expect(deriveExportStatus(f)).toBe('closed');
  });

  it('draft is reachable: nothing uploaded -> draft (not documents_pending)', () => {
    expect(deriveExportStatus(byId(7))).toBe('draft');
  });
});

describe('REGRESSION: ordering guard — blApproved tested BEFORE shippingBillApproved', () => {
  it('a shipping-bill-approved file with an approved BL resolves to shipped, not customs_cleared', () => {
    const f = byId(1); // customs_cleared: shipping_bill approved, BL only 'uploaded'
    expect(deriveExportStatus(f)).toBe('customs_cleared');
    f.docs = f.docs.map((d) => (d.type === 'bill_of_lading' ? { ...d, status: 'approved' } : d));
    expect(deriveExportStatus(f)).toBe('shipped');
  });
});

describe('multi-invoice gating', () => {
  it('a discrepant CI on ANY invoice forces documents_pending', () => {
    const f = byId(4); // otherwise cha_work, all approved
    f.invoices[1].ci.status = 'discrepant';
    f.invoices[1].ci.reason = 'Amount mismatch';
    expect(deriveExportStatus(f)).toBe('documents_pending');
  });

  it('a missing CI on invoice 2 keeps reqMissing > 0 and blocks cha_work', () => {
    const f = byId(4);
    f.invoices[1].ci.status = 'missing';
    expect(reqMissingExport(f)).toBeGreaterThan(0);
    expect(deriveExportStatus(f)).not.toBe('cha_work');
  });
});

describe('isRequiredExport — incoterm + mode matrix', () => {
  it('insurance_copy is required only under CIF', () => {
    expect(isRequiredExport('insurance_copy', { mode: 'sea', incoterm: 'CIF' })).toBe(true);
    expect(isRequiredExport('insurance_copy', { mode: 'sea', incoterm: 'FOB' })).toBe(false);
    expect(isRequiredExport('insurance_copy', { mode: 'sea', incoterm: 'CFR' })).toBe(false);
  });

  it('bill_of_lading is required for sea, awb for air (swapped)', () => {
    expect(isRequiredExport('bill_of_lading', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
    expect(isRequiredExport('bill_of_lading', { mode: 'air', incoterm: 'FOB' })).toBe(false);
    expect(isRequiredExport('awb', { mode: 'air', incoterm: 'FOB' })).toBe(true);
    expect(isRequiredExport('awb', { mode: 'sea', incoterm: 'FOB' })).toBe(false);
  });

  it('certificate_of_origin is always optional', () => {
    expect(isRequiredExport('certificate_of_origin', { mode: 'sea', incoterm: 'FOB' })).toBe(false);
    expect(isRequiredExport('certificate_of_origin', { mode: 'air', incoterm: 'CIF' })).toBe(false);
  });

  it('lut_bond, shipping_bill, firc_brc, and export CI/PL are always required', () => {
    expect(isRequiredExport('lut_bond', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
    expect(isRequiredExport('shipping_bill', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
    expect(isRequiredExport('firc_brc', { mode: 'sea', incoterm: 'FOB' })).toBe(true);
    expect(isRequiredExport('export_commercial_invoice', { mode: 'air', incoterm: 'CIF' })).toBe(true);
    expect(isRequiredExport('export_packing_list', { mode: 'air', incoterm: 'CIF' })).toBe(true);
  });
});

describe('realized — receivable payment gating', () => {
  it('not realized while any receivable is pending', () => {
    const f = byId(1); // advance paid, balance pending
    expect(deriveExportStatus(f)).not.toBe('payment_realized');
  });

  it('realized when every receivable is paid', () => {
    const f = byId(6); // both receivables paid
    expect(deriveExportStatus(f)).toBe('payment_realized');
  });

  it('a file with zero receivables is NOT payment_realized', () => {
    const f = byId(7); // no payments at all
    expect(f.payments.length).toBe(0);
    expect(deriveExportStatus(f)).not.toBe('payment_realized');
  });

  it('flipping the last pending receivable to paid realizes the file', () => {
    const f = byId(1);
    f.payments = f.payments.map((p) =>
      p.type === 'balance_received' ? { ...p, status: 'paid', paid: '30 Jun 2026' } : p,
    );
    expect(deriveExportStatus(f)).toBe('payment_realized');
  });
});

describe('payables never gate status', () => {
  it('a pending freight payable on a cha_work file leaves it cha_work', () => {
    const f = byId(3);
    expect(deriveExportStatus(f)).toBe('cha_work');
    f.payments.push({
      type: 'freight',
      direction: 'payable',
      currency: 'INR',
      inr: 45000,
      due: '01 Jul 2026',
      paid: null,
      status: 'pending',
      ref: '',
    });
    expect(deriveExportStatus(f)).toBe('cha_work');
  });

  it('an overdue cha_charges payable does not push status backward', () => {
    const f = byId(6); // payment_realized
    f.payments.push({
      type: 'cha_charges',
      direction: 'payable',
      currency: 'INR',
      inr: 18000,
      due: '01 Jun 2026',
      paid: null,
      status: 'overdue',
      ref: '',
    });
    expect(deriveExportStatus(f)).toBe('payment_realized');
  });
});

describe('derivePriorityExport', () => {
  it('discrepant doc -> urgent', () => {
    expect(derivePriorityExport(byId(2))).toBe('urgent');
  });
  it('near ETA (<=3) with missing gate docs -> urgent (isolated from the discrepant branch)', () => {
    const f = byId(7); // draft: no discrepant docs, gate docs (lut_bond/CI/PL) all missing
    f.etaDays = 2;
    expect(derivePriorityExport(f)).toBe('urgent');
  });
  it('otherwise preserves the seeded priority', () => {
    expect(derivePriorityExport(byId(7))).toBe('normal');
  });
});

describe('format.ts — export value / buyer helpers', () => {
  it('exportValueInr sums across all invoices', () => {
    const f4 = byId(4); // multi-invoice: 58,000 + 19,500 USD
    const sum = Math.round(f4.invoices[0].usd * f4.invoices[0].rate) + Math.round(f4.invoices[1].usd * f4.invoices[1].rate);
    expect(exportValueInr(f4)).toBe(sum);
  });

  it('distinctBuyers/buyerLabel collapse to a single name for a single-invoice file', () => {
    const f1 = byId(1);
    expect(distinctBuyers(f1)).toEqual(['Hamburg Organic GmbH']);
    expect(buyerLabel(f1)).toBe('Hamburg Organic GmbH');
  });

  it('buyerLabel shows "+N" for a multi-buyer file', () => {
    const f4 = byId(4); // Rotterdam Pulp Traders BV + Amsterdam Pack & Co.
    expect(distinctBuyers(f4)).toHaveLength(2);
    expect(buyerLabel(f4)).toBe('Rotterdam Pulp Traders BV +1');
  });
});
