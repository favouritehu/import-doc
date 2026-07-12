// Pure, side-effect-free status / priority / alert derivation for Export Desk.
// Mirrors app/src/lib/derive.ts (see docs/superpowers/specs/2026-07-11-export-
// desk-phase1-design.md §"Derive engine"). Screens read deriveExportStatus(file)
// on render, so uploading a doc or marking a payment paid live-updates the badge.

import type {
  Alert,
  AlertKind,
  Doc,
  ExportFile,
  ExportFileStatus,
  Incoterm,
  Mode,
  Priority,
} from '../types';
import { docLabel, EXPORT_CUSTOMS_DOCS, EXPORT_PAYMENT_LABELS } from './docs';

const EXPORT_CUSTOMS = new Set<string>(EXPORT_CUSTOMS_DOCS);

/** Every document slot: file docs + each invoice's CI/PL. */
export function allDocsExport(f: ExportFile): Doc[] {
  return [...f.docs, ...f.invoices.flatMap((i) => [i.ci, i.pl])];
}

/** Whether a doc type is mandatory for this file's mode + incoterm. */
export function isRequiredExport(type: string, f: { mode: Mode; incoterm: Incoterm }): boolean {
  switch (type) {
    case 'export_commercial_invoice':
    case 'export_packing_list':
      return true; // per-invoice, always required
    case 'lut_bond':
      return true;
    case 'certificate_of_origin':
      return false; // always optional
    case 'insurance_copy':
      return f.incoterm === 'CIF'; // we bear insurance only when selling CIF
    case 'bill_of_lading':
      return f.mode === 'sea';
    case 'awb':
      return f.mode === 'air';
    case 'shipping_bill':
    case 'firc_brc':
      return true;
    default:
      return true;
  }
}

const allRequiredExport = (f: ExportFile): Doc[] => allDocsExport(f).filter((d) => d.required);

/**
 * "Gate" docs = required docs the exporter must provide BEFORE customs
 * (LUT/CoO/insurance/CI/PL…). Customs-output docs (shipping bill, BL/AWB,
 * FIRC/BRC) are produced DURING/AFTER the CHA stage, so they must not block
 * the documents -> cha_work transition.
 */
export const gateDocsExport = (f: ExportFile): Doc[] =>
  allRequiredExport(f).filter((d) => !EXPORT_CUSTOMS.has(d.type));

/** Count of gate docs still missing or discrepant. */
export function reqMissingExport(f: ExportFile): number {
  return gateDocsExport(f).filter((d) => d.status === 'missing' || d.status === 'discrepant').length;
}

const gateDiscrepantExport = (f: ExportFile): boolean =>
  gateDocsExport(f).some((d) => d.status === 'discrepant');

/** Any required doc (incl. customs) flagged discrepant — used for alerts/priority. */
export const anyDiscrepantExport = (f: ExportFile): boolean =>
  allRequiredExport(f).some((d) => d.status === 'discrepant');

const anyGateUploadedExport = (f: ExportFile): boolean =>
  gateDocsExport(f).some((d) => d.status !== 'missing');

/** >=1 receivable payment AND every receivable row is paid. Payables never gate. */
const realized = (f: ExportFile): boolean => {
  const receivables = f.payments.filter((p) => p.direction === 'receivable');
  return receivables.length > 0 && receivables.every((p) => p.status === 'paid');
};

/** The export BL (sea) or AWB (air) doc is approved. */
const blApproved = (f: ExportFile): boolean => {
  const type = f.mode === 'air' ? 'awb' : 'bill_of_lading';
  return allDocsExport(f).some((d) => d.type === type && d.status === 'approved');
};

/** The shipping_bill doc is approved (LEO granted). */
const shippingBillApproved = (f: ExportFile): boolean =>
  allDocsExport(f).some((d) => d.type === 'shipping_bill' && d.status === 'approved');

/**
 * Derive the live file status. `realized` and `blApproved` are tested BEFORE
 * `shippingBillApproved` so the more-advanced stages (which imply an approved
 * shipping bill) are not swallowed by the customs_cleared branch — the same
 * ordering discipline as import's goods_received-before-duty_paid guard.
 */
export function deriveExportStatus(f: ExportFile): ExportFileStatus {
  if (f.statusManual) return f.status; // owner override wins (e.g. terminal 'closed')

  if (realized(f)) return 'payment_realized';
  if (blApproved(f)) return 'shipped'; // tested BEFORE customs_cleared
  if (shippingBillApproved(f)) return 'customs_cleared';

  if (!anyGateUploadedExport(f)) return 'draft'; // nothing uploaded yet
  if (reqMissingExport(f) > 0 || gateDiscrepantExport(f)) return 'documents_pending';
  return 'cha_work'; // docs complete, shipping bill filing in progress
}

export function derivePriorityExport(f: ExportFile): Priority {
  if (anyDiscrepantExport(f)) return 'urgent';
  if (f.etaDays >= 0 && f.etaDays <= 3 && reqMissingExport(f) > 0) return 'urgent';
  return f.priority; // preserve seeded high/normal
}

/** Map status -> [responsible name, role label]. */
export function responsibleExportOf(f: ExportFile): [string, string] {
  switch (deriveExportStatus(f)) {
    case 'draft':
    case 'documents_pending':
      return [f.manager, 'Export Manager'];
    case 'cha_work':
      return [f.cha, 'CHA'];
    case 'customs_cleared':
    case 'shipped':
      return [f.forwarder, 'Forwarder'];
    case 'payment_realized':
      return [f.accountant, 'Accountant'];
    case 'closed':
      return ['—', ''];
  }
}

// ── Alerts ────────────────────────────────────────────────────────────

const EXPORT_ALERT_ORDER: AlertKind[] = ['eta', 'discrepant', 'overdue', 'missing'];

const RED = '#DC2626';
const AMBER = '#F59E0B';

/** Mirror of format.ts's supplierLabel, for ExportInvoice's `buyer` field. */
function buyerLabel(f: ExportFile): string {
  const buyers = [...new Set(f.invoices.map((i) => i.buyer))];
  if (buyers.length === 0) return '—';
  if (buyers.length === 1) return buyers[0];
  return `${buyers[0]} +${buyers.length - 1}`;
}

function ownerBuyer(f: ExportFile, doc: Doc): string {
  const inv = f.invoices.find((i) => i.ci === doc || i.pl === doc);
  return inv ? inv.buyer : buyerLabel(f);
}

/**
 * All alerts for a single file, unsorted. Phase 1 ships the subset that maps
 * cleanly: discrepant, overdue (any payment overdue), eta (etaDays 0–3 with
 * gate missing), missing (gate doc missing when etaDays <= 7). No demurrage
 * (import-specific) and no approval_required beyond what Documents surfaces.
 */
export function exportFileAlerts(f: ExportFile): Alert[] {
  const out: Alert[] = [];
  const gate = gateDocsExport(f);
  const required = allRequiredExport(f);
  const rm = reqMissingExport(f);
  const base = { fileId: f.id, fileNumber: f.fileNumber };

  if (f.etaDays >= 0 && f.etaDays <= 3 && rm > 0) {
    out.push({
      ...base,
      kind: 'eta',
      title: 'Shipping soon',
      detail: `ETA ${f.eta} · ${rm} document${rm > 1 ? 's' : ''} pending`,
      accent: AMBER,
    });
  }
  for (const d of required) {
    if (d.status === 'discrepant') {
      out.push({
        ...base,
        kind: 'discrepant',
        title: 'Discrepant document',
        detail: `${docLabel(d.type)} — ${d.reason ?? 'flagged'} (${ownerBuyer(f, d)})`,
        accent: RED,
        party: ownerBuyer(f, d),
      });
    }
  }
  for (const p of f.payments) {
    if (p.status === 'overdue') {
      out.push({
        ...base,
        kind: 'overdue',
        title: 'Payment overdue',
        detail: `${EXPORT_PAYMENT_LABELS[p.type]} due ${p.due}`,
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

/** Alerts across all export files, sorted eta -> discrepant -> overdue -> missing. */
export function allExportAlerts(files: ExportFile[]): Alert[] {
  return files
    .flatMap(exportFileAlerts)
    .sort((a, b) => EXPORT_ALERT_ORDER.indexOf(a.kind) - EXPORT_ALERT_ORDER.indexOf(b.kind));
}

