// Pure "Today" merge: one urgency-sorted list of everything due across all files.
// Combines four existing sources — ETD/ETA reminders, files needing docs, files
// needing payments, and demurrage alerts — into uniform rows. `today` is injected
// so this stays fully unit-testable, matching the derive-live philosophy.

import type { ImportFile } from '../types';
import { allAlerts, requiredMissingDocs } from './derive';
import { supplierLabel } from './format';
import { filesNeedingDocs, filesNeedingPayments, pendingPaymentsOf } from './pending';
import { allReminders, type ReminderStatus } from './reminders';

export type TodayKind = 'etd' | 'eta' | 'docs' | 'payment' | 'demurrage';

export interface TodayItem {
  /** Stable key for React lists. */
  key: string;
  fileId: number;
  fileNumber: string;
  supplier: string;
  kind: TodayKind;
  status: ReminderStatus; // drives the dot colour + sort tier
  reason: string; // one-line "why this is here"
  date?: string; // ISO, present for etd/eta rows (used as a secondary sort key)
}

const RANK: Record<ReminderStatus, number> = { red: 0, amber: 1, green: 2 };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * All "today" rows across every file, sorted by urgency (red → amber → green),
 * then by date ascending where present, then by file number for stability.
 *
 * Each source is mapped 1:1 to rows — a file may yield several rows (e.g. an ETA
 * reminder AND a docs row). The four sources are chosen to barely overlap: only
 * `demurrage` is taken from `allAlerts` (eta/missing stay with the reminder +
 * pending helpers), so no dedup machinery is needed.
 */
export function todayItems(files: ImportFile[], today: string): TodayItem[] {
  const byId = new Map<number, ImportFile>(files.map((f) => [f.id, f]));
  const supplierOf = (id: number): string => {
    const f = byId.get(id);
    return f ? supplierLabel(f) : '—';
  };

  const items: TodayItem[] = [];

  // 1. ETD / ETA reminders (already includes green; green sorts to the bottom).
  for (const r of allReminders(files, today)) {
    items.push({
      key: `${r.kind}-${r.fileId}-${r.date}`,
      fileId: r.fileId,
      fileNumber: r.fileNumber,
      supplier: supplierOf(r.fileId),
      kind: r.kind,
      status: r.status,
      reason: r.kind === 'etd' ? `Departure — ${r.label}` : `Arrival — ${r.label}`,
      date: r.date,
    });
  }

  // 2. Files with missing / discrepant gate docs.
  for (const f of filesNeedingDocs(files)) {
    const missing = requiredMissingDocs(f);
    const discrepant = missing.some((d) => d.status === 'discrepant');
    items.push({
      key: `docs-${f.id}`,
      fileId: f.id,
      fileNumber: f.fileNumber,
      supplier: supplierLabel(f),
      kind: 'docs',
      status: discrepant ? 'red' : 'amber',
      reason: discrepant
        ? `${plural(missing.length, 'document')} missing or discrepant`
        : `${plural(missing.length, 'document')} pending`,
    });
  }

  // 3. Files with open, incoterm-relevant payments.
  for (const f of filesNeedingPayments(files)) {
    const pays = pendingPaymentsOf(f);
    const overdue = pays.some((p) => p.status === 'overdue');
    items.push({
      key: `payment-${f.id}`,
      fileId: f.id,
      fileNumber: f.fileNumber,
      supplier: supplierLabel(f),
      kind: 'payment',
      status: overdue ? 'red' : 'amber',
      reason: overdue
        ? `${plural(pays.length, 'payment')} overdue`
        : `${plural(pays.length, 'payment')} pending`,
    });
  }

  // 4. Demurrage (only this kind is pulled from allAlerts — others overlap above).
  for (const a of allAlerts(files).filter((x) => x.kind === 'demurrage')) {
    items.push({
      key: `demurrage-${a.fileId}`,
      fileId: a.fileId,
      fileNumber: a.fileNumber,
      supplier: supplierOf(a.fileId),
      kind: 'demurrage',
      status: 'red',
      reason: a.detail,
    });
  }

  return items.sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.fileNumber !== b.fileNumber) return a.fileNumber < b.fileNumber ? -1 : 1;
    return a.kind.localeCompare(b.kind);
  });
}
