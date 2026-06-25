// Pure helper for the parties workspace rail: one urgency-ranked row per file,
// led by party (supplier) name. Combines the reminder, document, and payment
// signals into a single status + a one-line reason. `today` is injected so it's
// unit-testable.

import type { ImportFile } from '../types';
import { deriveStatus, requiredMissingDocs } from './derive';
import { shipmentReminders } from './reminders';
import { supplierLabel } from './format';
import { STEP_LABELS } from './docs';

export type RailStatus = 'red' | 'amber' | 'green' | 'none';

export interface RailItem {
  fileId: number;
  fileNumber: string;
  party: string;
  status: RailStatus;
  line: string; // one-line reason / current state
}

const RANK: Record<RailStatus, number> = { red: 0, amber: 1, green: 2, none: 3 };
const worst = (...s: RailStatus[]): RailStatus =>
  s.reduce((a, b) => (RANK[b] < RANK[a] ? b : a), 'none');

export function railItem(f: ImportFile, today: string): RailItem {
  const reminders = shipmentReminders(f, today);
  const remStatus = reminders.reduce<RailStatus>((a, r) => (RANK[r.status] < RANK[a] ? r.status : a), 'none');
  const missing = requiredMissingDocs(f);
  const hasDiscrepant = missing.some((d) => d.status === 'discrepant');
  const overdue = f.payments.some((p) => p.status === 'overdue');
  const docStatus: RailStatus = hasDiscrepant ? 'red' : missing.length ? 'amber' : 'none';
  const payStatus: RailStatus = overdue ? 'red' : 'none';
  const status = worst(remStatus, docStatus, payStatus);

  let line = STEP_LABELS[deriveStatus(f)];
  if (status !== 'none') {
    const remHit = reminders.find((r) => r.status === status);
    if (payStatus === status && overdue) line = 'Payment overdue';
    else if (docStatus === status && hasDiscrepant) line = 'Document discrepancy';
    else if (remHit) line = `${remHit.kind === 'etd' ? 'Departure' : 'Arrival'} · ${remHit.label}`;
    else if (docStatus === status && missing.length) {
      line = `${missing.length} document${missing.length === 1 ? '' : 's'} pending`;
    }
  }

  return { fileId: f.id, fileNumber: f.fileNumber, party: supplierLabel(f), status, line };
}

/** Urgency-ranked rail rows (red → amber → green → none), then newest first. */
export function railItems(files: ImportFile[], today: string): RailItem[] {
  return files
    .map((f) => railItem(f, today))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.fileId - a.fileId);
}
