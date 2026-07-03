// Import Desk — Phase-A TypeScript types.
// These mirror the §4 control-tower schema (db/schema.sql) as closely as the
// dummy-data UI needs. Known Phase-A→B deltas are commented inline so the
// backend adapter can reconcile them mechanically.

export type DocStatus =
  | 'missing'
  | 'uploaded'
  | 'under_review'
  | 'approved'
  | 'discrepant'
  | 'corrected';

export type PayStatus = 'pending' | 'part_paid' | 'paid' | 'overdue';

export type ChaStepStatus = 'pending' | 'done' | 'na'; // carries cha_status ENUM incl. 'na'

export type FileStatus =
  | 'draft'
  | 'documents_pending'
  | 'bank_work'
  | 'cha_work'
  | 'duty_paid'
  | 'goods_received'
  | 'closed';

export type Priority = 'normal' | 'high' | 'urgent';

export type Role = 'admin' | 'import_manager' | 'accountant';

export type Party = 'supplier' | 'forwarder' | 'cha';

export type Mode = 'sea' | 'air';

export type Incoterm = 'FOB' | 'CIF' | 'CFR' | 'EXW' | 'DAP' | 'OTHER';

export type Currency = 'USD' | 'EUR' | 'CNY' | 'INR';

export type PaymentType =
  | 'advance'
  | 'balance'
  | 'freight'
  | 'insurance'
  | 'duty'
  | 'cha_charges'
  | 'bank_charges'
  | 'other';

/** A single document slot on the checklist. */
export interface Doc {
  type: string;
  label?: string;
  status: DocStatus;
  required: boolean;
  // Phase-A delta: `by`/`at` collapse uploaded_by/approved_by; reason keeps
  // discrepancy_reason. Phase-B adapter splits these into the two FK columns.
  by: string | null;
  at: string | null;
  reason?: string | null;
  version?: number;
  fileName?: string | null; // real uploaded file name (Phase A: client-side only)
  fileUrl?: string | null; // object URL for the picked file (in-memory, lost on reload)
  // Custom files added under a specific invoice/party live in file.docs but carry
  // the owning invoice id so the Documents tab groups them under that party.
  invoiceId?: string;
}

/**
 * One invoice line on a shared BL / single customs clearance.
 * A file always has >= 1 invoice. Supplier CAN differ per invoice.
 * This is the SOLE source of supplier/value/CI/PL — ImportFile has no mirror.
 */
export interface Invoice {
  id: string;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  product: string;
  qty: string;
  weight?: string; // gross/net weight with unit, e.g. "1,250 kg"
  hsn?: string; // financial-gated in UI (RolePolicy.canSeeHsn)
  usd: number; // goods value in `currency`
  currency: Currency;
  rate: number; // INR per unit of `currency`
  ci: Doc; // commercial_invoice for THIS line
  pl: Doc; // packing_list for THIS line
}

export interface Payment {
  type: PaymentType;
  currency?: Currency;
  usd?: number;
  rate?: number;
  inr?: number;
  due: string;
  paid: string | null;
  status: PayStatus;
  ref: string;
}

export interface Duty {
  bcd: number;
  sws: number;
  igst: number;
  cess: number;
  anti_dumping: number;
  other: number;
  // total is DERIVED (sum) — mirrors the GENERATED column in schema.sql
}

/** Per-step CHA override: [status, dateOrEmpty]. */
export interface ChaOv {
  [step: string]: [ChaStepStatus, string];
}

/** Note bubble: a=author, r=role, m=message, t=timestamp. */
export interface Note {
  a: string;
  r: string;
  m: string;
  t: string;
}

export interface ImportFile {
  id: number;
  fileNumber: string;
  country: string;
  mode: Mode;
  incoterm: Incoterm;
  isPartial: boolean;
  invoices: Invoice[]; // >= 1
  blAwb: string;
  containerNo?: string; // primary container number — preferred for live tracking
  portLoading: string;
  portArrival: string;
  etd?: string; // departure date, ISO YYYY-MM-DD (optional)
  eta: string; // arrival date; ISO going forward, legacy values parsed leniently
  etaDays: number;
  arrivedOn: string | null;
  vessel?: string; // from tracking (free paste-update or live)
  lastTrackingEvent?: string; // newest milestone, one line
  lastTrackingAt?: string; // when the user last pasted an update
  shippingLine: string;
  forwarder: string;
  boeNumber: string | null;
  boeDate: string | null;
  manager: string;
  accountant: string;
  cha: string;
  status: FileStatus; // seeded fallback; deriveStatus() is authoritative for display
  statusManual?: boolean; // owner override holds `status` (e.g. terminal 'closed')
  priority: Priority;
  discrepancy?: string;
  docs: Doc[]; // file-level docs only — NEVER commercial_invoice / packing_list
  payments: Payment[];
  duty: Duty;
  chaOv: ChaOv;
  notes: Note[];
}

// ── Master / reference data ───────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  role: Role;
  initials: string;
  email: string;
}

export interface Supplier {
  id: number;
  name: string;
  country: string;
  contact: string;
}

export interface ItemMaster {
  id: number;
  name: string;
  hsn: string;
  uom: string;
}

export interface FileTemplate {
  id: string;
  name: string;
  origin: string; // e.g. "Ningbo · Aseptic Pulp"
  mode: Mode;
  incoterm: Incoterm;
  country: string;
  currency: Currency;
  supplier: string;
  cha: string;
  shippingLine: string;
  forwarder: string;
  product: string;
  hsn: string;
  requiredDocsCount: number;
}

// ── Derived / UI types ────────────────────────────────────────────────

export type AlertKind =
  | 'demurrage'
  | 'eta'
  | 'approval_required'
  | 'discrepant'
  | 'overdue'
  | 'missing';

export interface Alert {
  kind: AlertKind;
  fileId: number;
  fileNumber: string;
  title: string;
  detail: string;
  accent: string; // hex
  party?: string; // owning invoice supplier where relevant
}

export interface NavItem {
  key: string;
  label: string;
  path: string;
  badge?: number;
}
