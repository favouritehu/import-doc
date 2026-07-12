// Dummy Export Desk data, seeded to the ExportFile shape. 7 files are
// engineered to exercise every deriveExportStatus branch + the multi-invoice
// path (file 4). Mirrors app/src/data/seed.ts.

import type { Currency, Doc, DocStatus, ExportFile, ExportInvoice } from '../types';
import { mkDoc } from '../lib/checklist';
import { mkExportChecklist } from '../lib/exportChecklist';
import { APPROX_INR_RATE } from '../lib/format';
import { USERS } from './seed';

// ── Masters (reuse import USERS for manager/accountant/cha names) ──────

const MANAGER = USERS.find((u) => u.role === 'import_manager')!.name; // 'Rahul Mehta'
const MANAGER_2 = USERS.filter((u) => u.role === 'import_manager')[1]!.name; // 'Anita Rao'
const ACCOUNTANT = USERS.find((u) => u.role === 'accountant')!.name; // 'Priya Shah'

// ── Seed builders (mirrors seed.ts's patch/applyPatch/seedInvoice) ─────

type DocPatch = DocStatus | { status: DocStatus; by?: string; at?: string; reason?: string };

function applyPatch(doc: Doc, p: DocPatch): Doc {
  if (typeof p === 'string') {
    return {
      ...doc,
      status: p,
      by: p === 'missing' ? null : doc.by ?? 'Exporter',
      at: p === 'missing' ? null : doc.at ?? '10 Jun 2026',
    };
  }
  return {
    ...doc,
    status: p.status,
    by: p.by ?? (p.status === 'missing' ? null : 'Exporter'),
    at: p.at ?? (p.status === 'missing' ? null : '10 Jun 2026'),
    reason: p.reason ?? doc.reason,
  };
}

function patch(docs: Doc[], map: Record<string, DocPatch>): Doc[] {
  return docs.map((doc) => (map[doc.type] ? applyPatch(doc, map[doc.type]) : doc));
}

interface SeedExportInv {
  id: string;
  buyer: string;
  invoiceNumber: string;
  invoiceDate: string;
  product: string;
  qty: string;
  hsn: string;
  usd: number;
  currency: Currency;
  ci: DocPatch;
  pl: DocPatch;
}

function seedExportInvoice(o: SeedExportInv): ExportInvoice {
  return {
    id: o.id,
    buyer: o.buyer,
    invoiceNumber: o.invoiceNumber,
    invoiceDate: o.invoiceDate,
    product: o.product,
    qty: o.qty,
    hsn: o.hsn,
    usd: o.usd,
    currency: o.currency,
    rate: APPROX_INR_RATE[o.currency],
    ci: applyPatch(mkDoc('export_commercial_invoice', 'missing', true), o.ci),
    pl: applyPatch(mkDoc('export_packing_list', 'missing', true), o.pl),
  };
}

// ── Files ─────────────────────────────────────────────────────────────

// e1 — customs_cleared: shipping_bill approved (LEO granted), BL not yet approved.
const e1: ExportFile = {
  id: 1,
  fileNumber: 'EXP-25-0001',
  destination: 'Germany',
  mode: 'sea',
  incoterm: 'FOB',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-1a',
      buyer: 'Hamburg Organic GmbH',
      invoiceNumber: 'FF-E-1001',
      invoiceDate: '02 Jun 2026',
      product: 'Aseptic Mango Pulp',
      qty: '2 × 40HC',
      hsn: '20089990',
      usd: 68000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: '',
  portLoading: 'Nhava Sheva',
  portDischarge: 'Hamburg',
  eta: '02 Jul 2026',
  etaDays: 12,
  shippedOn: null,
  shippingLine: 'Maersk',
  forwarder: 'OceanLink Logistics',
  shippingBillNo: 'SB-4471029',
  shippingBillDate: '15 Jun 2026',
  manager: MANAGER,
  accountant: ACCOUNTANT,
  cha: 'Speedy Clearing & Forwarding',
  status: 'customs_cleared',
  priority: 'high',
  docs: patch(mkExportChecklist('sea', 'FOB'), {
    lut_bond: 'approved',
    bill_of_lading: 'uploaded', // not yet approved -> not shipped
    shipping_bill: 'approved', // LEO granted -> customs_cleared
  }),
  payments: [
    { type: 'advance_received', direction: 'receivable', currency: 'USD', usd: 20400, rate: 83.2, due: '05 Jun 2026', paid: '05 Jun 2026', status: 'paid', ref: 'INW-2201' },
    { type: 'balance_received', direction: 'receivable', currency: 'USD', usd: 47600, rate: 83.3, due: '30 Jun 2026', paid: null, status: 'pending', ref: '' },
  ],
  notes: [
    { a: MANAGER, r: 'Export Manager', m: 'Shipping bill filed, LEO granted. Awaiting BL from shipping line.', t: '15 Jun 2026 11:20' },
  ],
};

// e2 — documents_pending: forced by a discrepant export commercial invoice.
const e2: ExportFile = {
  id: 2,
  fileNumber: 'EXP-25-0002',
  destination: 'UAE',
  mode: 'air',
  incoterm: 'CIF',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-2a',
      buyer: 'Dubai Fresh Trading LLC',
      invoiceNumber: 'FF-E-1002',
      invoiceDate: '10 Jun 2026',
      product: 'Label Film',
      qty: '260 rolls',
      hsn: '39199090',
      usd: 14200,
      currency: 'USD',
      ci: { status: 'discrepant', reason: 'Amount mismatch vs PO', by: 'Dubai Fresh Trading LLC', at: '13 Jun 2026' },
      pl: 'approved',
    }),
  ],
  blAwb: '',
  portLoading: 'Mumbai (BOM)',
  portDischarge: 'Dubai (DXB)',
  eta: '25 Jun 2026',
  etaDays: 5,
  shippedOn: null,
  shippingLine: 'Emirates SkyCargo',
  forwarder: 'AirBridge Cargo',
  shippingBillNo: null,
  shippingBillDate: null,
  manager: MANAGER_2,
  accountant: ACCOUNTANT,
  cha: 'Trident CHA',
  status: 'documents_pending',
  priority: 'urgent',
  discrepancy: 'Commercial invoice amount does not match the buyer PO by USD 800.',
  docs: patch(mkExportChecklist('air', 'CIF'), {
    lut_bond: 'approved',
    insurance_copy: 'approved', // required under CIF
  }),
  payments: [
    { type: 'advance_received', direction: 'receivable', currency: 'USD', usd: 4260, rate: 83.1, due: '11 Jun 2026', paid: '11 Jun 2026', status: 'paid', ref: 'INW-2210' },
    { type: 'balance_received', direction: 'receivable', currency: 'USD', usd: 9940, rate: 83.2, due: '28 Jun 2026', paid: null, status: 'pending', ref: '' },
  ],
  notes: [
    { a: MANAGER_2, r: 'Export Manager', m: 'CI amount flagged by buyer bank — correcting and resubmitting.', t: '13 Jun 2026 09:50' },
  ],
};

// e3 — cha_work: all gate docs clean, shipping bill filing in progress.
const e3: ExportFile = {
  id: 3,
  fileNumber: 'EXP-25-0003',
  destination: 'USA',
  mode: 'sea',
  incoterm: 'CFR',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-3a',
      buyer: 'Pacific Foods Inc.',
      invoiceNumber: 'FF-E-1003',
      invoiceDate: '05 Jun 2026',
      product: 'Aseptic Guava Pulp',
      qty: '3 × 40HC',
      hsn: '20089990',
      usd: 91000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: '',
  portLoading: 'Nhava Sheva',
  portDischarge: 'Los Angeles',
  eta: '10 Jul 2026',
  etaDays: 20,
  shippedOn: null,
  shippingLine: 'MSC',
  forwarder: 'OceanLink Logistics',
  shippingBillNo: null,
  shippingBillDate: null,
  manager: MANAGER,
  accountant: ACCOUNTANT,
  cha: 'Speedy Clearing & Forwarding',
  status: 'cha_work',
  priority: 'normal',
  docs: patch(mkExportChecklist('sea', 'CFR'), {
    lut_bond: 'approved',
    // insurance_copy not required under CFR — stays missing, doesn't gate
    // shipping_bill / bill_of_lading / firc_brc remain missing (customs, excluded from gate)
  }),
  payments: [
    { type: 'advance_received', direction: 'receivable', currency: 'USD', usd: 27300, rate: 83.2, due: '08 Jun 2026', paid: '08 Jun 2026', status: 'paid', ref: 'INW-2220' },
    { type: 'balance_received', direction: 'receivable', currency: 'USD', usd: 63700, rate: 83.3, due: '05 Jul 2026', paid: null, status: 'pending', ref: '' },
  ],
  notes: [
    { a: MANAGER, r: 'Export Manager', m: 'Docs complete, LUT filed. Shipping bill to be filed this week.', t: '09 Jun 2026 14:30' },
  ],
};

// e4 — multi-invoice file (2 buyers on one BL), landing on cha_work.
const e4: ExportFile = {
  id: 4,
  fileNumber: 'EXP-25-0004',
  destination: 'Netherlands',
  mode: 'sea',
  incoterm: 'CFR',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-4a',
      buyer: 'Rotterdam Pulp Traders BV',
      invoiceNumber: 'FF-E-1004',
      invoiceDate: '06 Jun 2026',
      product: 'Aseptic Pineapple Pulp',
      qty: '2 × 40HC',
      hsn: '20089990',
      usd: 58000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
    seedExportInvoice({
      id: 'exp-inv-4b',
      buyer: 'Amsterdam Pack & Co.',
      invoiceNumber: 'FF-E-1005',
      invoiceDate: '06 Jun 2026',
      product: 'Pouch Film & Caps',
      qty: '150 cartons',
      hsn: '39199090',
      usd: 19500,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: '',
  portLoading: 'Nhava Sheva',
  portDischarge: 'Rotterdam',
  eta: '15 Jul 2026',
  etaDays: 25,
  shippedOn: null,
  shippingLine: 'Maersk',
  forwarder: 'OceanLink Logistics',
  shippingBillNo: null,
  shippingBillDate: null,
  manager: MANAGER,
  accountant: ACCOUNTANT,
  cha: 'Speedy Clearing & Forwarding',
  status: 'cha_work',
  priority: 'high',
  docs: patch(mkExportChecklist('sea', 'CFR'), {
    lut_bond: 'approved',
  }),
  payments: [
    { type: 'advance_received', direction: 'receivable', currency: 'USD', usd: 23250, rate: 83.1, due: '09 Jun 2026', paid: '09 Jun 2026', status: 'paid', ref: 'INW-2230' },
    { type: 'balance_received', direction: 'receivable', currency: 'USD', usd: 54250, rate: 83.3, due: '10 Jul 2026', paid: null, status: 'pending', ref: '' },
  ],
  notes: [
    { a: MANAGER, r: 'Export Manager', m: 'Consolidated BL — Rotterdam pulp + Amsterdam film on one clearance.', t: '10 Jun 2026 16:00' },
  ],
};

// e5 — shipped: export BL approved (implies shipping bill was already cleared).
const e5: ExportFile = {
  id: 5,
  fileNumber: 'EXP-25-0005',
  destination: 'Vietnam',
  mode: 'sea',
  incoterm: 'FOB',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-5a',
      buyer: 'Saigon Import Co.',
      invoiceNumber: 'FF-E-1006',
      invoiceDate: '20 May 2026',
      product: 'Aseptic Banana Pulp',
      qty: '2 × 40HC',
      hsn: '20089990',
      usd: 52000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'ONEY-9981205',
  portLoading: 'Chennai',
  portDischarge: 'Cat Lai',
  etd: '28 May 2026',
  eta: '05 Jun 2026',
  etaDays: -37,
  shippedOn: '28 May 2026',
  shippingLine: 'ONE',
  forwarder: 'OceanLink Logistics',
  shippingBillNo: 'SB-4460211',
  shippingBillDate: '26 May 2026',
  manager: MANAGER_2,
  accountant: ACCOUNTANT,
  cha: 'Trident CHA',
  status: 'shipped',
  priority: 'normal',
  docs: patch(mkExportChecklist('sea', 'FOB'), {
    lut_bond: 'approved',
    insurance_copy: 'approved',
    bill_of_lading: 'approved', // -> shipped
    shipping_bill: 'approved',
  }),
  payments: [
    { type: 'advance_received', direction: 'receivable', currency: 'USD', usd: 15600, rate: 82.9, due: '22 May 2026', paid: '22 May 2026', status: 'paid', ref: 'INW-2240' },
    { type: 'balance_received', direction: 'receivable', currency: 'USD', usd: 36400, rate: 83.0, due: '20 Jun 2026', paid: null, status: 'pending', ref: '' },
  ],
  notes: [
    { a: MANAGER_2, r: 'Export Manager', m: 'Vessel sailed 28 May. BL received and approved.', t: '29 May 2026 10:10' },
  ],
};

// e6 — payment_realized: every receivable paid (FIRC/BRC evidence uploaded too).
const e6: ExportFile = {
  id: 6,
  fileNumber: 'EXP-25-0006',
  destination: 'UAE',
  mode: 'air',
  incoterm: 'CIF',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-6a',
      buyer: 'Sharjah Global Foods',
      invoiceNumber: 'FF-E-1007',
      invoiceDate: '02 May 2026',
      product: 'Pectin Powder',
      qty: '4,000 kg',
      hsn: '13023900',
      usd: 21000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'EK-176-88012340',
  portLoading: 'Mumbai (BOM)',
  portDischarge: 'Sharjah (SHJ)',
  etd: '06 May 2026',
  eta: '07 May 2026',
  etaDays: -66,
  shippedOn: '06 May 2026',
  shippingLine: 'Emirates SkyCargo',
  forwarder: 'AirBridge Cargo',
  shippingBillNo: 'SB-4440877',
  shippingBillDate: '05 May 2026',
  manager: MANAGER,
  accountant: ACCOUNTANT,
  cha: 'Speedy Clearing & Forwarding',
  status: 'payment_realized',
  priority: 'normal',
  docs: patch(mkExportChecklist('air', 'CIF'), {
    lut_bond: 'approved',
    insurance_copy: 'approved',
    awb: 'approved',
    shipping_bill: 'approved',
    firc_brc: 'approved',
  }),
  payments: [
    { type: 'advance_received', direction: 'receivable', currency: 'USD', usd: 6300, rate: 83.0, due: '04 May 2026', paid: '04 May 2026', status: 'paid', ref: 'INW-2250' },
    { type: 'balance_received', direction: 'receivable', currency: 'USD', usd: 14700, rate: 83.1, due: '25 May 2026', paid: '24 May 2026', status: 'paid', ref: 'INW-2260' },
  ],
  notes: [
    { a: ACCOUNTANT, r: 'Accountant', m: 'FIRC received from bank — full remittance realized. File ready to close.', t: '25 May 2026 12:45' },
  ],
};

// e7 — draft: nothing uploaded, no payments yet.
const e7: ExportFile = {
  id: 7,
  fileNumber: 'EXP-25-0007',
  destination: 'Thailand',
  mode: 'sea',
  incoterm: 'FOB',
  invoices: [
    seedExportInvoice({
      id: 'exp-inv-7a',
      buyer: 'Bangkok Retail Group',
      invoiceNumber: 'FF-E-1008',
      invoiceDate: '20 Jun 2026',
      product: 'Aseptic Passion Fruit Pulp',
      qty: '1 × 40HC',
      hsn: '20089990',
      usd: 29000,
      currency: 'USD',
      ci: 'missing',
      pl: 'missing',
    }),
  ],
  blAwb: '',
  portLoading: 'Chennai',
  portDischarge: 'Laem Chabang',
  eta: '25 Jul 2026',
  etaDays: 37,
  shippedOn: null,
  shippingLine: 'CMA CGM',
  forwarder: 'OceanLink Logistics',
  shippingBillNo: null,
  shippingBillDate: null,
  manager: MANAGER,
  accountant: ACCOUNTANT,
  cha: 'Trident CHA',
  status: 'draft',
  priority: 'normal',
  docs: mkExportChecklist('sea', 'FOB'),
  payments: [],
  notes: [
    { a: MANAGER, r: 'Export Manager', m: 'New order confirmed with Bangkok Retail Group. Awaiting LUT + CI/PL.', t: '20 Jun 2026 11:00' },
  ],
};

export const EXPORT_SEED_FILES: ExportFile[] = [e1, e2, e3, e4, e5, e6, e7];
