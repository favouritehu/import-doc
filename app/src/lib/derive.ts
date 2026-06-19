// Pure, side-effect-free status / priority / alert derivation.
// This replaces any hardcoded status string: cards, headers and the stepper all
// read deriveStatus(file), so uploading a doc or marking a payment paid live-
// updates the badge.

import type {
  Alert,
  AlertKind,
  Doc,
  FileStatus,
  ImportFile,
  Incoterm,
  Mode,
  Payment,
  Priority,
} from '../types';
import { CUSTOMS_DOCS, docLabel, PAYMENT_LABELS } from './docs';
import { supplierLabel } from './format';

const CUSTOMS = new Set<string>(CUSTOMS_DOCS);

/** Every document slot: file docs + each invoice's CI/PL. */
export function allDocs(f: ImportFile): Doc[] {
  return [...f.docs, ...f.invoices.flatMap((i) => [i.ci, i.pl])];
}

/** Whether a doc type is mandatory for this file's mode + incoterm (§6). */
export function isRequired(type: string, f: { mode: Mode; incoterm: Incoterm }): boolean {
  switch (type) {
    case 'certificate_of_origin':
      return false; // always optional
    case 'bank_letter':
      return false; // optional
    case 'insurance_copy':
      return f.incoterm !== 'CIF'; // supplier's cost under CIF
    case 'freight_invoice':
      return f.incoterm !== 'CIF' && f.incoterm !== 'CFR'; // supplier's cost under CIF/CFR
    case 'awb':
      return f.mode === 'air';
    case 'bill_of_lading':
      return f.mode === 'sea';
    case 'commercial_invoice':
    case 'packing_list':
      return true; // per-invoice, always required
    default:
      return true;
  }
}

const allRequired = (f: ImportFile): Doc[] => allDocs(f).filter((d) => d.required);

/**
 * "Gate" docs = required docs the supplier/forwarder must provide BEFORE customs
 * (PI/PO/CI/PL/BL/insurance/payment_proof…). Customs-output docs (BOE, challan,
 * assessment, OOC, DO) are produced DURING the CHA stage, so they must not block
 * the documents -> cha_work transition.
 */
const gateDocs = (f: ImportFile): Doc[] => allRequired(f).filter((d) => !CUSTOMS.has(d.type));

/** Count of gate docs still missing or discrepant. */
export function reqMissing(f: ImportFile): number {
  return gateDocs(f).filter((d) => d.status === 'missing' || d.status === 'discrepant').length;
}

const gateDiscrepant = (f: ImportFile): boolean =>
  gateDocs(f).some((d) => d.status === 'discrepant');

/** Any required doc (incl. customs) flagged discrepant — used for alerts/priority. */
export const anyDiscrepant = (f: ImportFile): boolean =>
  allRequired(f).some((d) => d.status === 'discrepant');

const anyGateUploaded = (f: ImportFile): boolean =>
  gateDocs(f).some((d) => d.status !== 'missing');

const payPending = (f: ImportFile): boolean =>
  f.payments.some(
    (p) =>
      (p.type === 'advance' || p.type === 'balance') &&
      (p.status === 'pending' || p.status === 'part_paid' || p.status === 'overdue'),
  );

const dutyPaid = (f: ImportFile): boolean =>
  f.payments.some((p) => p.type === 'duty' && p.status === 'paid');

const ooc = (f: ImportFile): boolean => f.chaOv.out_of_charge?.[0] === 'done';

const doDone = (f: ImportFile): boolean =>
  f.chaOv.delivery_order?.[0] === 'done' ||
  allDocs(f).some((d) => d.type === 'delivery_order' && d.status === 'approved');

/**
 * Derive the live file status (§5, §14). The two most-advanced stages are tested
 * FIRST so `goods_received` (which always implies dutyPaid) is not swallowed by
 * the `duty_paid` branch. The pre-duty stages then evaluate forward (first
 * incomplete) over GATE docs only.
 */
export function deriveStatus(f: ImportFile): FileStatus {
  if (f.statusManual) return f.status; // owner override wins (e.g. terminal 'closed')

  if (doDone(f) && ooc(f)) return 'goods_received'; // tested BEFORE duty_paid
  if (dutyPaid(f)) return 'duty_paid';

  if (!anyGateUploaded(f)) return 'draft'; // nothing uploaded yet
  if (reqMissing(f) > 0 || gateDiscrepant(f)) return 'documents_pending';
  if (payPending(f)) return 'bank_work'; // docs in, supplier payment pending
  return 'cha_work'; // docs complete + supplier paid, customs in progress
}

export function derivePriority(f: ImportFile): Priority {
  if (anyDiscrepant(f)) return 'urgent';
  if (f.etaDays >= 0 && f.etaDays <= 3 && reqMissing(f) > 0) return 'urgent';
  if (f.arrivedOn && !ooc(f)) return 'urgent'; // demurrage clock running
  return f.priority; // preserve seeded high/normal
}

/** Incoterm-aware payment trimming — mirrors the doc logic (§6). */
export function relevantPayments(f: ImportFile): Payment[] {
  return f.payments.filter((p) => {
    if (p.type === 'insurance' && f.incoterm === 'CIF') return false;
    if (p.type === 'freight' && (f.incoterm === 'CIF' || f.incoterm === 'CFR')) return false;
    return true;
  });
}

/** Map status -> [responsible name, role label] (§2 "who"). */
export function responsibleOf(f: ImportFile): [string, string] {
  switch (deriveStatus(f)) {
    case 'draft':
    case 'documents_pending':
    case 'goods_received':
      return [f.manager, 'Import Manager'];
    case 'bank_work':
    case 'duty_paid':
      return [f.accountant, 'Accountant'];
    case 'cha_work':
      return [f.cha, 'CHA'];
    case 'closed':
      return ['—', ''];
  }
}

// ── Alerts ────────────────────────────────────────────────────────────

const ALERT_ORDER: AlertKind[] = [
  'demurrage',
  'eta',
  'approval_required',
  'discrepant',
  'overdue',
  'missing',
];

const RED = '#DC2626';
const AMBER = '#F59E0B';

function ownerSupplier(f: ImportFile, doc: Doc): string {
  const inv = f.invoices.find((i) => i.ci === doc || i.pl === doc);
  return inv ? inv.supplier : supplierLabel(f);
}

/** All alerts for a single file, unsorted. */
export function fileAlerts(f: ImportFile): Alert[] {
  const out: Alert[] = [];
  const gate = gateDocs(f);
  const required = allRequired(f);
  const rm = reqMissing(f);
  const base = { fileId: f.id, fileNumber: f.fileNumber };

  if (f.arrivedOn && !ooc(f)) {
    out.push({
      ...base,
      kind: 'demurrage',
      title: 'Demurrage risk',
      detail: `Arrived ${f.arrivedOn} · awaiting Out of Charge`,
      accent: RED,
    });
  }
  if (f.etaDays >= 0 && f.etaDays <= 3 && rm > 0) {
    out.push({
      ...base,
      kind: 'eta',
      title: 'Arriving soon',
      detail: `ETA ${f.eta} · ${rm} document${rm > 1 ? 's' : ''} pending`,
      accent: AMBER,
    });
  }
  for (const d of required) {
    if (d.status === 'under_review') {
      out.push({
        ...base,
        kind: 'approval_required',
        title: 'Approval needed',
        detail: `${docLabel(d.type)} awaiting approval`,
        accent: AMBER,
        party: ownerSupplier(f, d),
      });
    }
  }
  for (const d of required) {
    if (d.status === 'discrepant') {
      out.push({
        ...base,
        kind: 'discrepant',
        title: 'Discrepant document',
        detail: `${docLabel(d.type)} — ${d.reason ?? 'flagged'} (${ownerSupplier(f, d)})`,
        accent: RED,
        party: ownerSupplier(f, d),
      });
    }
  }
  for (const p of f.payments) {
    if (p.status === 'overdue') {
      out.push({
        ...base,
        kind: 'overdue',
        title: 'Payment overdue',
        detail: `${PAYMENT_LABELS[p.type]} due ${p.due}`,
        accent: RED,
      });
    }
  }
  if (f.etaDays <= 7) {
    for (const d of gate) {
      if (d.status === 'missing') {
        out.push({
          ...base,
          kind: 'missing',
          title: 'Document missing',
          detail: `${docLabel(d.type)} not uploaded`,
          accent: AMBER,
        });
      }
    }
  }
  return out;
}

/** Alerts across all files, sorted demurrage -> eta -> approval -> discrepant -> overdue -> missing. */
export function allAlerts(files: ImportFile[]): Alert[] {
  return files
    .flatMap(fileAlerts)
    .sort((a, b) => ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind));
}

/** Gate docs still missing/discrepant — used by the Pending Docs screen. */
export function requiredMissingDocs(f: ImportFile): Doc[] {
  return gateDocs(f).filter((d) => d.status === 'missing' || d.status === 'discrepant');
}
