// Pure helper for the parties workspace rail: one row per file, led by party
// (supplier) name. The status + line track the CONTAINER ARRIVAL (ETA), not docs:
// green = safe zone (plenty of time), red = urgent (arriving within 4 days or
// overdue). `today` is injected so it's unit-testable.

import type { ImportFile } from '../types';
import { deriveStatus } from './derive';
import { daysBetween } from './dates';
import { supplierLabel } from './format';
import { statusMeta } from './docs';

export type RailStatus = 'red' | 'amber' | 'green' | 'none';

export interface RailItem {
  fileId: number;
  fileNumber: string;
  party: string;
  status: RailStatus;
  line: string; // arrival tracking, e.g. "Arrives in 12 days" / "Overdue 3 days"
  chip: { label: string; bg: string; fg: string }; // derived status pill (statusMeta)
}

/** Arrival is urgent (red) once the container is this many days away or closer. */
export const ARRIVAL_URGENT_DAYS = 4;

const RANK: Record<RailStatus, number> = { red: 0, amber: 1, green: 2, none: 3 };
const plural = (n: number) => (n === 1 ? '' : 's');

export function railItem(f: ImportFile, today: string): RailItem {
  const base = { fileId: f.id, fileNumber: f.fileNumber, party: supplierLabel(f) };
  const arrived = !!f.arrivedOn || deriveStatus(f) === 'goods_received';
  const d = daysBetween(today, f.eta); // whole days to ETA; null if no/garbled date

  let status: RailStatus;
  let line: string;
  if (arrived) {
    status = 'green';
    line = 'Arrived';
  } else if (d === null) {
    status = 'none';
    line = 'No arrival date';
  } else if (d < 0) {
    status = 'red';
    line = `Overdue ${Math.abs(d)} day${plural(Math.abs(d))}`;
  } else if (d === 0) {
    status = 'red';
    line = 'Arrives today';
  } else if (d <= ARRIVAL_URGENT_DAYS) {
    status = 'red';
    line = `Arrives in ${d} day${plural(d)}`;
  } else {
    status = 'green';
    line = `Arrives in ${d} days`;
  }
  const meta = statusMeta[deriveStatus(f)];
  return { ...base, status, line, chip: { label: meta.label, bg: meta.bg, fg: meta.fg } };
}

/** Rail rows: urgent arrivals (red) first, then safe (green), then no-date; newest first. */
export function railItems(files: ImportFile[], today: string): RailItem[] {
  return files
    .map((f) => railItem(f, today))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || b.fileId - a.fileId);
}
