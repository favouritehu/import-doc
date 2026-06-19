// Cross-file "what is pending" helpers, shared by nav badges and the
// PendingDocs / PendingPayments screens.

import type { ImportFile, Payment } from '../types';
import { allAlerts, relevantPayments, requiredMissingDocs } from './derive';

const isOpen = (p: Payment): boolean =>
  p.status === 'pending' || p.status === 'part_paid' || p.status === 'overdue';

export const filesNeedingDocs = (files: ImportFile[]): ImportFile[] =>
  files.filter((f) => requiredMissingDocs(f).length > 0);

export const pendingPaymentsOf = (f: ImportFile): Payment[] =>
  relevantPayments(f).filter(isOpen);

export const filesNeedingPayments = (files: ImportFile[]): ImportFile[] =>
  files.filter((f) => pendingPaymentsOf(f).length > 0);

export interface PendingPayRow {
  file: ImportFile;
  payment: Payment;
  idx: number;
}

/** Flatten open, incoterm-relevant payments to rows, keeping the original index
 *  (needed by markPaid) — NOT the relevantPayments index. */
export function pendingPaymentRows(files: ImportFile[]): PendingPayRow[] {
  const rows: PendingPayRow[] = [];
  for (const f of files) {
    const rel = new Set(relevantPayments(f));
    f.payments.forEach((p, idx) => {
      if (rel.has(p) && isOpen(p)) rows.push({ file: f, payment: p, idx });
    });
  }
  return rows;
}

export interface NavBadges {
  'pending-docs': number;
  'pending-payments': number;
  alerts: number;
}

export function navBadges(files: ImportFile[]): NavBadges {
  return {
    'pending-docs': filesNeedingDocs(files).length,
    'pending-payments': filesNeedingPayments(files).length,
    alerts: allAlerts(files).length,
  };
}
