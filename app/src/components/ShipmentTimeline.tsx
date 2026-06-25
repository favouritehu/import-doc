// Slim ETD ●────── ETA progress bar. Reads the pure reminder engine on render
// (derive-live): a status-colored dot sits at `timeline.pct`, endpoint dates are
// shown via fmtDate, and the active milestone label ("departs in Xd" / "arrived"
// / "overdue") is surfaced. Degrades gracefully when a file has no usable dates.

import type { ImportFile } from '../types';
import { fmtDate, todayIso } from '../lib/dates';
import { shipmentReminders, shipmentTimeline, type ReminderStatus } from '../lib/reminders';

// Status hexes are data consumed as inline style (codebase convention), not
// Tailwind classes — matches lib/docs.ts tint handling.
const STATUS_HEX: Record<ReminderStatus, string> = {
  green: '#16A34A',
  amber: '#F59E0B',
  red: '#DC2626',
};

export function ShipmentTimeline({
  file,
  variant,
}: {
  file: ImportFile;
  variant: 'card' | 'detail';
}) {
  const today = todayIso();
  const t = shipmentTimeline(file, today);
  const reminders = shipmentReminders(file, today);

  const hasDates = Boolean(t.etd || t.eta);
  if (!hasDates) {
    if (variant === 'card') return null;
    return <p className="text-[11px] text-faint">No dates yet</p>;
  }

  const color = STATUS_HEX[t.status];
  // Active label: the most urgent (red < amber < green) milestone reminder.
  const rank: Record<ReminderStatus, number> = { red: 0, amber: 1, green: 2 };
  const active = reminders.slice().sort((a, b) => rank[a.status] - rank[b.status])[0];
  const etdLabel = fmtDate(t.etd);
  const etaLabel = fmtDate(t.eta);

  const detail = variant === 'detail';

  return (
    <div className={detail ? 'flex flex-col gap-1.5' : 'flex flex-col gap-1'}>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-faint">
        <span>ETD{etdLabel ? ` · ${etdLabel}` : ''}</span>
        <span>ETA{etaLabel ? ` · ${etaLabel}` : ''}</span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-page">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${t.pct}%`, backgroundColor: color, opacity: 0.4 }}
        />
        {/* endpoint nodes */}
        <span
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: '0%', backgroundColor: t.etd ? color : '#CBD5E1' }}
        />
        <span
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: '100%', backgroundColor: t.eta ? color : '#CBD5E1' }}
        />
        {/* progress dot */}
        <span
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{
            left: `${t.pct}%`,
            width: detail ? 12 : 10,
            height: detail ? 12 : 10,
            backgroundColor: color,
          }}
        />
      </div>
      {active && (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
          {active.label}
        </div>
      )}
    </div>
  );
}
