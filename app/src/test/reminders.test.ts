import { describe, expect, it } from 'vitest';
import type { ImportFile } from '../types';
import { SEED_FILES } from '../data/seed';
import {
  AMBER_DAYS,
  allReminders,
  dueReminderCount,
  shipmentReminders,
  shipmentTimeline,
} from '../lib/reminders';

// Minimal file factory: only the fields the reminder engine reads matter.
// deriveStatus runs over these, but with empty docs/payments it yields 'draft',
// which never equals 'goods_received' — so `arrived` is driven by arrivedOn only,
// exactly what these tests want to control.
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

const TODAY = '2026-06-15';

describe('shipmentReminders — status boundaries at AMBER_DAYS', () => {
  it('green strictly beyond AMBER_DAYS', () => {
    // etd is AMBER_DAYS+1 days out -> green
    const f = mkFile({ etd: '2026-06-19' }); // 4 days out
    const [r] = shipmentReminders(f, TODAY);
    expect(r.daysLeft).toBe(AMBER_DAYS + 1);
    expect(r.status).toBe('green');
  });

  it('amber exactly at AMBER_DAYS', () => {
    const f = mkFile({ etd: '2026-06-18' }); // 3 days out
    const [r] = shipmentReminders(f, TODAY);
    expect(r.daysLeft).toBe(AMBER_DAYS);
    expect(r.status).toBe('amber');
  });

  it('amber at 0 days (due today, milestone not yet done)', () => {
    const f = mkFile({ eta: '2026-06-15' }); // today, not arrived
    const [r] = shipmentReminders(f, TODAY);
    expect(r.daysLeft).toBe(0);
    expect(r.status).toBe('amber');
    expect(r.label).toBe('arrives in 0 days');
  });

  it('red when past and milestone not done', () => {
    const f = mkFile({ eta: '2026-06-10' }); // 5 days ago, not arrived
    const [r] = shipmentReminders(f, TODAY);
    expect(r.daysLeft).toBe(-5);
    expect(r.status).toBe('red');
    expect(r.label).toBe('overdue');
  });
});

describe('shipmentReminders — milestone neutralization', () => {
  it('etd in the past + departed -> not red (green) with "departed" label', () => {
    const f = mkFile({ etd: '2026-06-10' }); // past; departed because today >= etd
    const [r] = shipmentReminders(f, TODAY);
    expect(r.kind).toBe('etd');
    expect(r.daysLeft).toBe(-5);
    expect(r.status).toBe('green');
    expect(r.label).toBe('departed');
  });

  it('eta in the past + arrived (arrivedOn set) -> not red (green) with "arrived" label', () => {
    const f = mkFile({ eta: '2026-06-10', arrivedOn: '2026-06-11' });
    const r = shipmentReminders(f, TODAY).find((x) => x.kind === 'eta')!;
    expect(r.daysLeft).toBe(-5);
    expect(r.status).toBe('green');
    expect(r.label).toBe('arrived');
  });

  it('eta past but NOT arrived stays red — neutralization is per-milestone', () => {
    const f = mkFile({ etd: '2026-06-10', eta: '2026-06-12' }); // departed, not arrived
    const etd = shipmentReminders(f, TODAY).find((x) => x.kind === 'etd')!;
    const eta = shipmentReminders(f, TODAY).find((x) => x.kind === 'eta')!;
    expect(etd.status).toBe('green'); // departed -> neutral
    expect(eta.status).toBe('red'); // not arrived -> still red
  });

  it('skips files with no usable dates', () => {
    expect(shipmentReminders(mkFile({ eta: '' }), TODAY)).toEqual([]);
  });

  it('future etd uses "departs in N days" label', () => {
    const f = mkFile({ etd: '2026-06-16' });
    const [r] = shipmentReminders(f, TODAY);
    expect(r.label).toBe('departs in 1 day'); // singular
  });
});

describe('allReminders — sort by date ascending', () => {
  it('orders earliest date first across files', () => {
    const files = [
      mkFile({ id: 1, fileNumber: 'A', eta: '2026-07-01' }),
      mkFile({ id: 2, fileNumber: 'B', etd: '2026-06-20', eta: '2026-06-25' }),
      mkFile({ id: 3, fileNumber: 'C', eta: '2026-06-18' }),
    ];
    const dates = allReminders(files, TODAY).map((r) => r.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
    expect(dates[0]).toBe('2026-06-18');
  });
});

describe('dueReminderCount — amber + red only', () => {
  it('counts amber and red, excludes green', () => {
    const files = [
      mkFile({ id: 1, eta: '2026-06-30' }), // green (15 days out)
      mkFile({ id: 2, eta: '2026-06-17' }), // amber (2 days)
      mkFile({ id: 3, eta: '2026-06-10' }), // red (overdue, not arrived)
      mkFile({ id: 4, eta: '2026-06-10', arrivedOn: '2026-06-11' }), // arrived -> green
    ];
    expect(dueReminderCount(files, TODAY)).toBe(2);
  });
});

describe('shipmentTimeline — pct endpoints', () => {
  it('0% before etd', () => {
    const f = mkFile({ etd: '2026-06-20', eta: '2026-06-30' }); // not departed yet
    const t = shipmentTimeline(f, TODAY);
    expect(t.departed).toBe(false);
    expect(t.pct).toBe(0);
  });

  it('100% once arrived', () => {
    const f = mkFile({ etd: '2026-06-01', eta: '2026-06-10', arrivedOn: '2026-06-11' });
    const t = shipmentTimeline(f, TODAY);
    expect(t.arrived).toBe(true);
    expect(t.pct).toBe(100);
  });

  it('linear midpoint between etd and eta', () => {
    // etd 2026-06-10, eta 2026-06-20, today 2026-06-15 -> 50%
    const f = mkFile({ etd: '2026-06-10', eta: '2026-06-20' });
    const t = shipmentTimeline(f, TODAY);
    expect(t.departed).toBe(true);
    expect(t.pct).toBe(50);
  });

  it('clamps to 0..100 and does not throw with only-etd / only-eta files', () => {
    const onlyEtdFuture = shipmentTimeline(mkFile({ etd: '2026-06-30' }), TODAY);
    expect(onlyEtdFuture.pct).toBe(0);
    const onlyEtdPast = shipmentTimeline(mkFile({ etd: '2026-06-01' }), TODAY);
    expect(onlyEtdPast.pct).toBe(100); // departed, no eta
    const onlyEta = shipmentTimeline(mkFile({ eta: '2026-06-30' }), TODAY);
    expect(onlyEta.pct).toBe(0);
    const none = shipmentTimeline(mkFile({}), TODAY);
    expect(none.pct).toBe(0);
  });
});

describe('seed smoke — engine works on real legacy ("DD Mon YYYY") data', () => {
  it('produces non-empty reminders over SEED_FILES', () => {
    const rs = allReminders(SEED_FILES, '2026-06-15');
    expect(rs.length).toBeGreaterThan(0);
    // every reminder carries a real countdown number
    for (const r of rs) expect(Number.isFinite(r.daysLeft)).toBe(true);
  });

  it('neutralizes arrived seed files (file 1 & 6 have arrivedOn) to green eta', () => {
    const rs = allReminders(SEED_FILES, '2026-06-15');
    const f1eta = rs.find((r) => r.fileId === 1 && r.kind === 'eta');
    if (f1eta) expect(f1eta.status).toBe('green'); // arrivedOn set
  });
});
