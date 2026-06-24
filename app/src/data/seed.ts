// Dummy data seeded to the §4 control-tower schema shape. Every object mirrors a
// table row so the Phase-B swap is mechanical. The 7 files are engineered to
// exercise every deriveStatus branch + the multi-invoice path (file 5).

import type {
  ChaOv,
  Doc,
  DocStatus,
  Duty,
  FileTemplate,
  ImportFile,
  Invoice,
  ItemMaster,
  Supplier,
  User,
  Currency,
} from '../types';
import { mkChecklist, mkDoc } from '../lib/checklist';
import { APPROX_INR_RATE } from '../lib/format';
import { CHA_STEPS } from '../lib/docs';

// ── Masters ───────────────────────────────────────────────────────────

export const USERS: User[] = [
  { id: 1, name: 'Vikram Patel', role: 'admin', initials: 'VP', email: 'vikram@favouritefab.in' },
  { id: 2, name: 'Rahul Mehta', role: 'import_manager', initials: 'RM', email: 'rahul@favouritefab.in' },
  { id: 3, name: 'Anita Rao', role: 'import_manager', initials: 'AR', email: 'anita@favouritefab.in' },
  { id: 4, name: 'Priya Shah', role: 'accountant', initials: 'PS', email: 'priya@favouritefab.in' },
];

export const SUPPLIERS: Supplier[] = [
  { id: 1, name: 'Ningbo Foods Co.', country: 'China', contact: 'Li Wei · +86 574 8888' },
  { id: 2, name: 'Qingdao Glass Works', country: 'China', contact: 'Zhang Min · +86 532 7777' },
  { id: 3, name: 'Bangkok Aseptic Ltd.', country: 'Thailand', contact: 'Somchai · +66 2 555' },
  { id: 4, name: 'Saigon Pulp JSC', country: 'Vietnam', contact: 'Tran Anh · +84 28 333' },
  { id: 5, name: 'Guangzhou Pack Co.', country: 'China', contact: 'Chen Hui · +86 20 9999' },
];

export const ITEMS: ItemMaster[] = [
  { id: 1, name: 'Aseptic Fruit Pulp', hsn: '20089990', uom: 'KG' },
  { id: 2, name: 'Glass Jars 500ml', hsn: '70109000', uom: 'PCS' },
  { id: 3, name: 'Label Film', hsn: '39199090', uom: 'ROLL' },
  { id: 4, name: 'Pectin Powder', hsn: '13023900', uom: 'KG' },
];

// Live template picker is empty by default — no demo templates. The originals
// are kept here (unused) only as a reference / future restore source.
export const TEMPLATES: FileTemplate[] = [];

const DEMO_TEMPLATES: FileTemplate[] = [
  {
    id: 'tpl-ningbo-pulp',
    name: 'Ningbo · Aseptic Pulp',
    origin: 'Ningbo, China',
    mode: 'sea',
    incoterm: 'CFR',
    country: 'China',
    currency: 'USD',
    supplier: 'Ningbo Foods Co.',
    cha: 'Speedy Clearing & Forwarding',
    shippingLine: 'Maersk',
    forwarder: 'OceanLink Logistics',
    product: 'Aseptic Fruit Pulp',
    hsn: '20089990',
    requiredDocsCount: 9,
  },
  {
    id: 'tpl-qingdao-jars',
    name: 'Qingdao · Glass Jars',
    origin: 'Qingdao, China',
    mode: 'sea',
    incoterm: 'FOB',
    country: 'China',
    currency: 'USD',
    supplier: 'Qingdao Glass Works',
    cha: 'Trident CHA',
    shippingLine: 'MSC',
    forwarder: 'OceanLink Logistics',
    product: 'Glass Jars 500ml',
    hsn: '70109000',
    requiredDocsCount: 11,
  },
  {
    id: 'tpl-guangzhou-film',
    name: 'Guangzhou · Label Film',
    origin: 'Guangzhou, China',
    mode: 'air',
    incoterm: 'FOB',
    country: 'China',
    currency: 'USD',
    supplier: 'Guangzhou Pack Co.',
    cha: 'Speedy Clearing & Forwarding',
    shippingLine: 'Emirates SkyCargo',
    forwarder: 'AirBridge Cargo',
    product: 'Label Film',
    hsn: '39199090',
    requiredDocsCount: 9,
  },
];

// ── Seed builders ─────────────────────────────────────────────────────

type DocPatch = DocStatus | { status: DocStatus; by?: string; at?: string; reason?: string };

function applyPatch(doc: Doc, p: DocPatch): Doc {
  if (typeof p === 'string') {
    return {
      ...doc,
      status: p,
      by: p === 'missing' ? null : doc.by ?? 'Forwarder',
      at: p === 'missing' ? null : doc.at ?? '10 Jun 2026',
    };
  }
  return {
    ...doc,
    status: p.status,
    by: p.by ?? (p.status === 'missing' ? null : 'Forwarder'),
    at: p.at ?? (p.status === 'missing' ? null : '10 Jun 2026'),
    reason: p.reason ?? doc.reason,
  };
}

function patch(docs: Doc[], map: Record<string, DocPatch>): Doc[] {
  return docs.map((doc) => (map[doc.type] ? applyPatch(doc, map[doc.type]) : doc));
}

interface SeedInv {
  id: string;
  supplier: string;
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

function seedInvoice(o: SeedInv): Invoice {
  return {
    id: o.id,
    supplier: o.supplier,
    invoiceNumber: o.invoiceNumber,
    invoiceDate: o.invoiceDate,
    product: o.product,
    qty: o.qty,
    hsn: o.hsn,
    usd: o.usd,
    currency: o.currency,
    rate: APPROX_INR_RATE[o.currency],
    ci: applyPatch(mkDoc('commercial_invoice', 'missing', true), o.ci),
    pl: applyPatch(mkDoc('packing_list', 'missing', true), o.pl),
  };
}

function mkCha(done: Record<string, string> = {}, na: string[] = []): ChaOv {
  const ov: ChaOv = {};
  for (const s of CHA_STEPS) {
    if (s.key in done) ov[s.key] = ['done', done[s.key]];
    else if (na.includes(s.key)) ov[s.key] = ['na', ''];
    else ov[s.key] = ['pending', ''];
  }
  return ov;
}

const noDuty: Duty = { bcd: 0, sws: 0, igst: 0, cess: 0, anti_dumping: 0, other: 0 };

// ── Files ─────────────────────────────────────────────────────────────

const f1: ImportFile = {
  id: 1,
  fileNumber: 'IMP-25-0001',
  country: 'China',
  mode: 'sea',
  incoterm: 'CFR',
  isPartial: false,
  invoices: [
    seedInvoice({
      id: 'inv-1a',
      supplier: 'Ningbo Foods Co.',
      invoiceNumber: 'NB-2451',
      invoiceDate: '02 May 2026',
      product: 'Aseptic Mango Pulp',
      qty: '2 × 40HC',
      hsn: '20089990',
      usd: 84000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'MAEU-7781204',
  portLoading: 'Ningbo',
  portArrival: 'Nhava Sheva',
  eta: '08 Jun 2026',
  etaDays: -10,
  arrivedOn: '09 Jun 2026',
  shippingLine: 'Maersk',
  forwarder: 'OceanLink Logistics',
  boeNumber: 'BOE-5512098',
  boeDate: '11 Jun 2026',
  manager: 'Rahul Mehta',
  accountant: 'Priya Shah',
  cha: 'Speedy Clearing & Forwarding',
  status: 'duty_paid',
  priority: 'urgent',
  docs: patch(mkChecklist('sea', 'CFR'), {
    proforma_invoice: 'approved',
    purchase_order: 'approved',
    bill_of_lading: 'approved',
    insurance_copy: 'approved',
    payment_proof: 'approved',
    bill_of_entry: 'approved',
    duty_challan: 'approved',
    assessment_copy: 'approved',
  }),
  payments: [
    { type: 'advance', currency: 'USD', usd: 25200, rate: 83.2, due: '05 May 2026', paid: '05 May 2026', status: 'paid', ref: 'TT-9901' },
    { type: 'balance', currency: 'USD', usd: 58800, rate: 83.3, due: '01 Jun 2026', paid: '31 May 2026', status: 'paid', ref: 'TT-9988' },
    { type: 'duty', currency: 'INR', inr: 1644000, due: '11 Jun 2026', paid: '11 Jun 2026', status: 'paid', ref: 'CH-5512098' },
    { type: 'cha_charges', currency: 'INR', inr: 48000, due: '13 Jun 2026', paid: null, status: 'pending', ref: '' },
  ],
  duty: { bcd: 624000, sws: 62400, igst: 924000, cess: 0, anti_dumping: 0, other: 33600 },
  chaOv: mkCha({
    documents_received: '04 Jun 2026',
    igm_filed: '06 Jun 2026',
    boe_filed: '11 Jun 2026',
    assessment: '11 Jun 2026',
    duty_paid: '11 Jun 2026',
  }),
  notes: [
    { a: 'Rahul Mehta', r: 'Import Manager', m: 'Container arrived Nhava Sheva, OOC pending — demurrage starts 14 Jun.', t: '12 Jun 2026 10:20' },
    { a: 'Priya Shah', r: 'Accountant', m: 'Duty paid, challan uploaded. CHA to push for examination.', t: '11 Jun 2026 16:05' },
  ],
};

const f2: ImportFile = {
  id: 2,
  fileNumber: 'IMP-25-0002',
  country: 'China',
  mode: 'sea',
  incoterm: 'FOB',
  isPartial: false,
  invoices: [
    seedInvoice({
      id: 'inv-2a',
      supplier: 'Qingdao Glass Works',
      invoiceNumber: 'QG-8830',
      invoiceDate: '20 May 2026',
      product: 'Glass Jars 500ml',
      qty: '1 × 40HC',
      hsn: '70109000',
      usd: 41000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'MSCU-2249871',
  portLoading: 'Qingdao',
  portArrival: 'Mundra',
  eta: '24 Jun 2026',
  etaDays: 6,
  arrivedOn: null,
  shippingLine: 'MSC',
  forwarder: 'OceanLink Logistics',
  boeNumber: null,
  boeDate: null,
  manager: 'Anita Rao',
  accountant: 'Priya Shah',
  cha: 'Trident CHA',
  status: 'documents_pending',
  priority: 'high',
  docs: patch(mkChecklist('sea', 'FOB'), {
    proforma_invoice: 'approved',
    purchase_order: 'approved',
    bill_of_lading: 'uploaded',
    payment_proof: 'approved',
    freight_invoice: 'uploaded',
    // insurance_copy stays MISSING (required under FOB) — the demo gap
  }),
  payments: [
    { type: 'advance', currency: 'USD', usd: 12300, rate: 83.1, due: '22 May 2026', paid: '22 May 2026', status: 'paid', ref: 'TT-7711' },
  ],
  duty: noDuty,
  chaOv: mkCha({ documents_received: '14 Jun 2026' }),
  notes: [
    { a: 'Anita Rao', r: 'Import Manager', m: 'Insurance copy still pending from forwarder. Chased on WhatsApp.', t: '15 Jun 2026 09:40' },
  ],
};

const f3: ImportFile = {
  id: 3,
  fileNumber: 'IMP-25-0003',
  country: 'Thailand',
  mode: 'sea',
  incoterm: 'CIF',
  isPartial: false,
  invoices: [
    seedInvoice({
      id: 'inv-3a',
      supplier: 'Bangkok Aseptic Ltd.',
      invoiceNumber: 'BK-1190',
      invoiceDate: '28 May 2026',
      product: 'Aseptic Pineapple Pulp',
      qty: '3 × 20FT',
      hsn: '20089990',
      usd: 62500,
      currency: 'USD',
      ci: { status: 'discrepant', reason: '金额不符 · Amount mismatch', by: 'Bangkok Aseptic Ltd.', at: '03 Jun 2026' },
      pl: 'approved',
    }),
  ],
  blAwb: 'CMAU-5567120',
  portLoading: 'Laem Chabang',
  portArrival: 'Nhava Sheva',
  eta: '21 Jun 2026',
  etaDays: 3,
  arrivedOn: null,
  shippingLine: 'CMA CGM',
  forwarder: 'OceanLink Logistics',
  boeNumber: null,
  boeDate: null,
  manager: 'Rahul Mehta',
  accountant: 'Priya Shah',
  cha: 'Speedy Clearing & Forwarding',
  status: 'documents_pending',
  priority: 'urgent',
  discrepancy: 'Commercial invoice amount does not match the PI by USD 2,500.',
  docs: patch(mkChecklist('sea', 'CIF'), {
    proforma_invoice: 'approved',
    purchase_order: 'approved',
    bill_of_lading: 'approved',
    payment_proof: 'approved',
  }),
  payments: [
    { type: 'advance', currency: 'USD', usd: 18750, rate: 83.0, due: '30 May 2026', paid: '30 May 2026', status: 'paid', ref: 'TT-6620' },
  ],
  duty: noDuty,
  chaOv: mkCha({ documents_received: '05 Jun 2026' }),
  notes: [
    { a: 'Rahul Mehta', r: 'Import Manager', m: 'CI shows USD 62,500 but PI was 60,000. Flagged to supplier for correction.', t: '06 Jun 2026 11:15' },
  ],
};

const f4: ImportFile = {
  id: 4,
  fileNumber: 'IMP-25-0004',
  country: 'China',
  mode: 'air',
  incoterm: 'FOB',
  isPartial: false,
  invoices: [
    seedInvoice({
      id: 'inv-4a',
      supplier: 'Guangzhou Pack Co.',
      invoiceNumber: 'GZ-3321',
      invoiceDate: '01 Jun 2026',
      product: 'Label Film',
      qty: '320 rolls',
      hsn: '39199090',
      usd: 16800,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'EK-176-55012345',
  portLoading: 'Guangzhou (CAN)',
  portArrival: 'Mumbai (BOM)',
  eta: '02 Jul 2026',
  etaDays: 14,
  arrivedOn: null,
  shippingLine: 'Emirates SkyCargo',
  forwarder: 'AirBridge Cargo',
  boeNumber: null,
  boeDate: null,
  manager: 'Anita Rao',
  accountant: 'Priya Shah',
  cha: 'Speedy Clearing & Forwarding',
  status: 'bank_work',
  priority: 'high',
  docs: patch(mkChecklist('air', 'FOB'), {
    proforma_invoice: 'approved',
    purchase_order: 'approved',
    awb: 'approved',
    insurance_copy: 'uploaded',
    payment_proof: 'approved',
    freight_invoice: 'uploaded',
  }),
  payments: [
    { type: 'advance', currency: 'USD', usd: 5040, rate: 83.2, due: '03 Jun 2026', paid: '03 Jun 2026', status: 'paid', ref: 'TT-5510' },
    { type: 'balance', currency: 'USD', usd: 11760, rate: 83.4, due: '12 Jun 2026', paid: null, status: 'overdue', ref: '' },
  ],
  duty: noDuty,
  chaOv: mkCha({ documents_received: '13 Jun 2026' }),
  notes: [
    { a: 'Priya Shah', r: 'Accountant', m: 'Balance TT to Guangzhou Pack is overdue — bank cut-off missed, will process Monday.', t: '15 Jun 2026 17:30' },
  ],
};

const f5: ImportFile = {
  id: 5,
  fileNumber: 'IMP-25-0005',
  country: 'China',
  mode: 'sea',
  incoterm: 'CFR',
  isPartial: true,
  invoices: [
    seedInvoice({
      id: 'inv-5a',
      supplier: 'Ningbo Foods Co.',
      invoiceNumber: 'NB-2480',
      invoiceDate: '10 May 2026',
      product: 'Aseptic Guava Pulp',
      qty: '2 × 40HC',
      hsn: '20089990',
      usd: 71000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
    seedInvoice({
      id: 'inv-5b',
      supplier: 'Guangzhou Pack Co.',
      invoiceNumber: 'GZ-3290',
      invoiceDate: '11 May 2026',
      product: 'Pouch Film & Caps',
      qty: '180 cartons',
      hsn: '39199090',
      usd: 23500,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'MAEU-7799310',
  portLoading: 'Ningbo',
  portArrival: 'Nhava Sheva',
  eta: '23 Jun 2026',
  etaDays: 5,
  arrivedOn: null,
  shippingLine: 'Maersk',
  forwarder: 'OceanLink Logistics',
  boeNumber: 'BOE-5520415',
  boeDate: '16 Jun 2026',
  manager: 'Rahul Mehta',
  accountant: 'Priya Shah',
  cha: 'Speedy Clearing & Forwarding',
  status: 'cha_work',
  priority: 'high',
  docs: patch(mkChecklist('sea', 'CFR'), {
    proforma_invoice: 'approved',
    purchase_order: 'approved',
    bill_of_lading: 'approved',
    insurance_copy: 'approved',
    payment_proof: 'approved',
    bill_of_entry: 'approved',
    assessment_copy: 'approved',
  }),
  payments: [
    { type: 'advance', currency: 'USD', usd: 28350, rate: 83.1, due: '12 May 2026', paid: '12 May 2026', status: 'paid', ref: 'TT-4471' },
    { type: 'balance', currency: 'USD', usd: 66150, rate: 83.3, due: '08 Jun 2026', paid: '07 Jun 2026', status: 'paid', ref: 'TT-4490' },
    { type: 'duty', currency: 'INR', inr: 1786000, due: '18 Jun 2026', paid: null, status: 'pending', ref: '' },
  ],
  duty: { bcd: 678000, sws: 67800, igst: 1003000, cess: 0, anti_dumping: 0, other: 37200 },
  chaOv: mkCha({
    documents_received: '12 Jun 2026',
    igm_filed: '14 Jun 2026',
    boe_filed: '16 Jun 2026',
    assessment: '16 Jun 2026',
  }),
  notes: [
    { a: 'Rahul Mehta', r: 'Import Manager', m: 'Consolidated BL — Ningbo pulp + Guangzhou film on one clearance. BOE assessed, duty payment pending.', t: '16 Jun 2026 14:00' },
  ],
};

const f6: ImportFile = {
  id: 6,
  fileNumber: 'IMP-25-0006',
  country: 'Vietnam',
  mode: 'sea',
  incoterm: 'FOB',
  isPartial: false,
  invoices: [
    seedInvoice({
      id: 'inv-6a',
      supplier: 'Saigon Pulp JSC',
      invoiceNumber: 'SG-7012',
      invoiceDate: '12 Apr 2026',
      product: 'Aseptic Banana Pulp',
      qty: '2 × 40HC',
      hsn: '20089990',
      usd: 58000,
      currency: 'USD',
      ci: 'approved',
      pl: 'approved',
    }),
  ],
  blAwb: 'ONEY-3380012',
  portLoading: 'Cat Lai',
  portArrival: 'Chennai',
  eta: '20 May 2026',
  etaDays: -29,
  arrivedOn: '21 May 2026',
  shippingLine: 'ONE',
  forwarder: 'OceanLink Logistics',
  boeNumber: 'BOE-5498220',
  boeDate: '23 May 2026',
  manager: 'Anita Rao',
  accountant: 'Priya Shah',
  cha: 'Trident CHA',
  status: 'goods_received',
  priority: 'normal',
  docs: patch(mkChecklist('sea', 'FOB'), {
    proforma_invoice: 'approved',
    purchase_order: 'approved',
    bill_of_lading: 'approved',
    insurance_copy: 'approved',
    payment_proof: 'approved',
    freight_invoice: 'approved',
    bill_of_entry: 'approved',
    duty_challan: 'approved',
    assessment_copy: 'approved',
    out_of_charge: 'approved',
    delivery_order: 'approved',
  }),
  payments: [
    { type: 'advance', currency: 'USD', usd: 17400, rate: 82.9, due: '14 Apr 2026', paid: '14 Apr 2026', status: 'paid', ref: 'TT-3310' },
    { type: 'balance', currency: 'USD', usd: 40600, rate: 83.0, due: '10 May 2026', paid: '09 May 2026', status: 'paid', ref: 'TT-3360' },
    { type: 'duty', currency: 'INR', inr: 1402000, due: '23 May 2026', paid: '23 May 2026', status: 'paid', ref: 'CH-5498220' },
    { type: 'cha_charges', currency: 'INR', inr: 41000, due: '25 May 2026', paid: '26 May 2026', status: 'paid', ref: 'INV-CHA-220' },
  ],
  duty: { bcd: 533000, sws: 53300, igst: 786000, cess: 0, anti_dumping: 0, other: 29700 },
  chaOv: mkCha({
    documents_received: '17 May 2026',
    igm_filed: '19 May 2026',
    boe_filed: '23 May 2026',
    assessment: '23 May 2026',
    duty_paid: '23 May 2026',
    examination: '24 May 2026',
    out_of_charge: '25 May 2026',
    delivery_order: '26 May 2026',
    goods_delivered: '27 May 2026',
  }),
  notes: [
    { a: 'Anita Rao', r: 'Import Manager', m: 'Goods delivered to Taloja warehouse. Clean clearance, file ready to close.', t: '27 May 2026 13:10' },
  ],
};

const f7: ImportFile = {
  id: 7,
  fileNumber: 'IMP-25-0007',
  country: 'Vietnam',
  mode: 'sea',
  incoterm: 'FOB',
  isPartial: false,
  invoices: [
    seedInvoice({
      id: 'inv-7a',
      supplier: 'Saigon Pulp JSC',
      invoiceNumber: 'SG-7044',
      invoiceDate: '14 Jun 2026',
      product: 'Aseptic Passion Fruit Pulp',
      qty: '1 × 40HC',
      hsn: '20089990',
      usd: 39000,
      currency: 'USD',
      ci: 'missing',
      pl: 'missing',
    }),
  ],
  blAwb: '',
  portLoading: 'Cat Lai',
  portArrival: 'Nhava Sheva',
  eta: '18 Jul 2026',
  etaDays: 30,
  arrivedOn: null,
  shippingLine: 'ONE',
  forwarder: 'OceanLink Logistics',
  boeNumber: null,
  boeDate: null,
  manager: 'Rahul Mehta',
  accountant: 'Priya Shah',
  cha: 'Trident CHA',
  status: 'draft',
  priority: 'normal',
  docs: mkChecklist('sea', 'FOB'),
  payments: [],
  duty: noDuty,
  chaOv: mkCha(),
  notes: [
    { a: 'Rahul Mehta', r: 'Import Manager', m: 'New PO placed with Saigon Pulp. Awaiting PI and shipment booking.', t: '14 Jun 2026 12:00' },
  ],
};

export const SEED_FILES: ImportFile[] = [f1, f2, f3, f4, f5, f6, f7];
