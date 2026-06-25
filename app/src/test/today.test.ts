import { describe, expect, it } from 'vitest';
import type { Doc, ImportFile, Payment } from '../types';
import { SEED_FILES } from '../data/seed';
import { todayItems } from '../lib/today';

// Same minimal factory as reminders.test.ts: only the fields the merge reads
// matter. Empty docs/payments yield no docs/payment rows, so each test opts in.
function mkFile(over: Partial<ImportFile>): ImportFile {
  return {
    id: 1,
    fileNumber: 'IMP-T',
    country: 'China',
    mode: 'sea',
    incoterm: 'FOB',
    isPartial: false,
    invoices: [],
    blAwb: '',
    portLoading: '',
    portArrival: '',
    eta: '',
    etaDays: 0,
    arrivedOn: null,
    shippingLine: '',
    forwarder: '',
    boeNumber: null,
    boeDate: null,
    manager: '',
    accountant: '',
    cha: '',
    status: 'draft',
    priority: 'normal',
    docs: [],
    payments: [],
    duty: { bcd: 0, sws: 0, igst: 0, cess: 0, anti_dumping: 0, other: 0 },
    chaOv: {},
    notes: [],
    ...over,
  };
}

function doc(over: Partial<Doc>): Doc {
  return { type: 'commercial_invoice', status: 'missing', required: true, by: null, at: null, ...over };
}

function pay(over: Partial<Payment>): Payment {
  return { type: 'advance', due: '2026-06-20', paid: null, status: 'pending', ref: '', ...over };
}

const TODAY = '2026-06-15';

describe('todayItems — merge of all four sources', () => {
  it('emits an etd and an eta reminder row for a dated file', () => {
    const items = todayItems([mkFile({ etd: '2026-06-17', eta: '2026-06-25' })], TODAY);
    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('etd');
    expect(kinds).toContain('eta');
  });

  it('emits a docs row (amber) when a required gate doc is missing', () => {
    const f = mkFile({ docs: [doc({ type: 'bill_of_lading', status: 'missing' })] });
    const items = todayItems([f], TODAY);
    const row = items.find((i) => i.kind === 'docs');
    expect(row).toBeDefined();
    expect(row!.status).toBe('amber');
    expect(row!.reason).toContain('pending');
  });

  it('promotes a docs row to red when a gate doc is discrepant', () => {
    const f = mkFile({ docs: [doc({ type: 'bill_of_lading', status: 'discrepant' })] });
    const row = todayItems([f], TODAY).find((i) => i.kind === 'docs');
    expect(row!.status).toBe('red');
  });

  it('emits a payment row (red) when a payment is overdue', () => {
    const f = mkFile({ payments: [pay({ status: 'overdue' })] });
    const row = todayItems([f], TODAY).find((i) => i.kind === 'payment');
    expect(row).toBeDefined();
    expect(row!.status).toBe('red');
  });

  it('emits a demurrage row (red) when arrived but no out-of-charge', () => {
    const f = mkFile({ arrivedOn: '2026-06-10' });
    const row = todayItems([f], TODAY).find((i) => i.kind === 'demurrage');
    expect(row).toBeDefined();
    expect(row!.status).toBe('red');
  });
});

describe('todayItems — urgency sort red → amber → green', () => {
  it('orders red before amber before green', () => {
    const files = [
      mkFile({ id: 1, fileNumber: 'GREEN', eta: '2026-06-30' }), // green (15 days out)
      mkFile({ id: 2, fileNumber: 'RED', eta: '2026-06-10' }), // red (overdue, not arrived)
      mkFile({ id: 3, fileNumber: 'AMBER', eta: '2026-06-17' }), // amber (2 days)
    ];
    const ranks = todayItems(files, TODAY).map((i) => i.status);
    const sorted = [...ranks].sort(
      (a, b) => ({ red: 0, amber: 1, green: 2 })[a] - ({ red: 0, amber: 1, green: 2 })[b],
    );
    expect(ranks).toEqual(sorted);
    expect(ranks[0]).toBe('red');
  });

  it('includes green reminders (list is empty only when truly nothing is due)', () => {
    const items = todayItems([mkFile({ eta: '2026-06-30' })], TODAY);
    expect(items.length).toBe(1);
    expect(items[0].status).toBe('green');
    // a file with no dates / docs / payments yields nothing
    expect(todayItems([mkFile({})], TODAY)).toEqual([]);
  });
});

describe('todayItems — supplier label resolves via file lookup', () => {
  it('carries supplierLabel through for reminder rows', () => {
    const items = todayItems(SEED_FILES, TODAY);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) expect(typeof i.supplier).toBe('string');
  });
});
