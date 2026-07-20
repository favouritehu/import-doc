// Pure shipment-reminder engine. `today` (ISO) is always injected — never reads
// the real clock here — so it is fully unit-testable. Derives ETD/ETA reminders
// and a timeline from a file, following the derive-live philosophy.

import type { ImportFile } from '../types';
import { daysBetween, parseDate } from './dates';
import { deriveStatus } from './derive';

export type ReminderStatus = 'green' | 'amber' | 'red';

export interface ShipmentReminder {
  fileId: number;
  fileNumber: string;
  kind: 'etd' | 'eta';
  date: string; // ISO (or whatever string the file carries; engine parses leniently)
  daysLeft: number; // negative = past
  status: ReminderStatus;
  label: string; // "departs in 8 days" | "departed" | "arrives in 3 days" | "arrived" | "overdue"
}

export interface ShipmentTimeline {
  etd?: string;
  eta?: string;
  departed: boolean;
  arrived: boolean;
  pct: number; // 0..100 progress etd->eta by today
  status: ReminderStatus;
}

/** Days-out threshold below which a reminder turns amber (tunable). */
export const AMBER_DAYS = 3;

/** True once the shipment has physically departed (etd set and today on/after it). */
function isDeparted(file: ImportFile, today: string): boolean {
  if (!file.etd) return false;
  const d = daysBetween(today, file.etd); // etd - today
  return d != null && d <= 0; // today >= etd
}

/** True once the shipment is delivered/terminal: explicit arrivedOn, or a done
 *  status (goods_received / closed). A terminal file can never be "overdue". */
function isArrived(file: ImportFile): boolean {
  const s = deriveStatus(file);
  return file.arrivedOn != null || s === 'goods_received' || s === 'closed';
}

/**
 * Status for a milestone `daysLeft` away. A past (negative) milestone is `red`
 * UNLESS its milestone is already done, in which case it is neutralized to green.
 */
function statusFor(daysLeft: number, done: boolean): ReminderStatus {
  if (done) return 'green';
  if (daysLeft < 0) return 'red';
  if (daysLeft <= AMBER_DAYS) return 'amber';
  return 'green';
}

function plural(n: number): string {
  return Math.abs(n) === 1 ? 'day' : 'days';
}

/**
 * Reminders for one file: an `etd` reminder if etd is set, an `eta` reminder if
 * eta is parseable. Files with no usable dates yield none.
 */
export function shipmentReminders(file: ImportFile, today: string): ShipmentReminder[] {
  const out: ShipmentReminder[] = [];
  const base = { fileId: file.id, fileNumber: file.fileNumber };
  const departed = isDeparted(file, today);
  const arrived = isArrived(file);

  // ETD
  if (file.etd) {
    const daysLeft = daysBetween(today, file.etd);
    if (daysLeft != null) {
      const label = departed ? 'departed' : `departs in ${daysLeft} ${plural(daysLeft)}`;
      out.push({
        ...base,
        kind: 'etd',
        date: file.etd,
        daysLeft,
        status: statusFor(daysLeft, departed),
        label,
      });
    }
  }

  // ETA
  if (parseDate(file.eta)) {
    const daysLeft = daysBetween(today, file.eta);
    if (daysLeft != null) {
      const label = arrived
        ? 'arrived'
        : daysLeft < 0
          ? 'overdue'
          : `arrives in ${daysLeft} ${plural(daysLeft)}`;
      out.push({
        ...base,
        kind: 'eta',
        date: file.eta,
        daysLeft,
        status: statusFor(daysLeft, arrived),
        label,
      });
    }
  }

  return out;
}

/** All reminders across all files, sorted by date ascending (earliest first). */
export function allReminders(files: ImportFile[], today: string): ShipmentReminder[] {
  return files
    .flatMap((f) => shipmentReminders(f, today))
    .sort((a, b) => {
      const da = parseDate(a.date)?.getTime() ?? 0;
      const db = parseDate(b.date)?.getTime() ?? 0;
      return da - db;
    });
}

/** Linear ETD->ETA timeline for one file, evaluated at `today`. */
export function shipmentTimeline(file: ImportFile, today: string): ShipmentTimeline {
  const departed = isDeparted(file, today);
  const arrived = isArrived(file);
  const hasEta = parseDate(file.eta) != null;

  // pct: 0 before etd, 100 after eta/arrived, linear between.
  let pct: number;
  if (arrived) {
    pct = 100;
  } else if (file.etd && hasEta) {
    const span = daysBetween(file.etd, file.eta); // total etd->eta days
    const elapsed = daysBetween(file.etd, today); // etd->today days
    if (span == null || elapsed == null || span <= 0) {
      pct = departed ? 100 : 0;
    } else {
      pct = Math.max(0, Math.min(100, (elapsed / span) * 100));
    }
  } else if (file.etd && !hasEta) {
    pct = departed ? 100 : 0;
  } else if (!file.etd && hasEta) {
    pct = 0;
  } else {
    pct = 0;
  }

  // Timeline status = the most urgent of its two active milestone reminders.
  const reminders = shipmentReminders(file, today);
  const rank: Record<ReminderStatus, number> = { red: 0, amber: 1, green: 2 };
  const status = reminders.reduce<ReminderStatus>(
    (worst, r) => (rank[r.status] < rank[worst] ? r.status : worst),
    'green',
  );

  return {
    etd: file.etd,
    eta: hasEta ? file.eta : undefined,
    departed,
    arrived,
    pct,
    status,
  };
}

/** Count of due reminders (amber + red) across all files — for the nav badge. */
export function dueReminderCount(files: ImportFile[], today: string): number {
  return allReminders(files, today).filter((r) => r.status === 'amber' || r.status === 'red')
    .length;
}
