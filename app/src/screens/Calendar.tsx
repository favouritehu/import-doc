import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/EmptyState';
import { useIsMobile } from '../lib/useIsMobile';
import { daysBetween, fmtDate, monthMatrix, parseDate, todayIso } from '../lib/dates';
import { allReminders, type ReminderStatus, type ShipmentReminder } from '../lib/reminders';
import { supplierLabel } from '../lib/format';
import { useStore } from '../store/store';
import type { ImportFile } from '../types';

// Status hexes as inline style (codebase convention — see lib/docs.ts, ShipmentTimeline).
const STATUS_HEX: Record<ReminderStatus, string> = {
  green: '#16A34A',
  amber: '#F59E0B',
  red: '#DC2626',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const glyph = (kind: ShipmentReminder['kind']): string => (kind === 'etd' ? '▲' : '▼');
const verb = (kind: ShipmentReminder['kind']): string => (kind === 'etd' ? 'departs' : 'arrives');

/** Whether a reminder's date falls on the given calendar ISO day (UTC-safe). */
const onDay = (r: ShipmentReminder, iso: string): boolean => daysBetween(iso, r.date) === 0;

export function Calendar() {
  const { files } = useStore();
  const nav = useNavigate();
  const isMobile = useIsMobile();

  const today = todayIso();
  const reminders = useMemo(() => allReminders(files, today), [files, today]);
  const supplierOf = useMemo(() => {
    const m = new Map<number, string>();
    files.forEach((f: ImportFile) => m.set(f.id, supplierLabel(f)));
    return m;
  }, [files]);

  // Viewed month — starts on the current month, prev/next steps it.
  const now = parseDate(today) ?? new Date();
  const [view, setView] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });

  const step = (delta: number) =>
    setView((v) => {
      const m0 = v.month - 1 + delta; // 0-based across year boundaries
      return { year: v.year + Math.floor(m0 / 12), month: ((m0 % 12) + 12) % 12 + 1 };
    });

  const matrix = useMemo(() => monthMatrix(view.year, view.month), [view]);

  // Reminders whose date lands inside the displayed grid, grouped by ISO day.
  const byDay = useMemo(() => {
    const m = new Map<string, ShipmentReminder[]>();
    for (const week of matrix) {
      for (const cell of week) {
        const hits = reminders.filter((r) => onDay(r, cell.iso));
        if (hits.length) m.set(cell.iso, hits);
      }
    }
    return m;
  }, [matrix, reminders]);

  const monthLabel = `${MONTH_NAMES[view.month - 1]} ${view.year}`;
  const total = [...byDay.values()].reduce((n, list) => n + list.length, 0);

  const goToFile = (r: ShipmentReminder) => nav(`/files/${r.fileId}`);

  const header = (
    <div className="mb-3 flex items-center justify-between">
      <button
        onClick={() => step(-1)}
        aria-label="Previous month"
        className="grid h-9 w-9 place-items-center rounded-full border border-border text-medium hover:border-navy"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="text-center">
        <div className="font-display text-base font-bold text-ink">{monthLabel}</div>
        <button
          onClick={() => setView({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })}
          className="text-[11px] font-semibold text-blue hover:text-navy"
        >
          Today
        </button>
      </div>
      <button
        onClick={() => step(1)}
        aria-label="Next month"
        className="grid h-9 w-9 place-items-center rounded-full border border-border text-medium hover:border-navy"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );

  // ---- Mobile: date-grouped agenda for the viewed month ----
  if (isMobile) {
    const days = [...byDay.entries()].sort((a, b) => {
      const da = parseDate(a[0])?.getTime() ?? 0;
      const db = parseDate(b[0])?.getTime() ?? 0;
      return da - db;
    });
    return (
      <>
        <TopBar
          title="Calendar"
          subtitle={total > 0 ? `${total} shipment date${total === 1 ? '' : 's'}` : 'No shipment dates'}
        />
        <Page>
          {header}
          {days.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              sub="No departures or arrivals fall in this month."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {days.map(([iso, list]) => (
                <div key={iso}>
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                    {fmtDate(iso)}
                  </div>
                  <div className="flex flex-col gap-2">
                    {list.map((r) => (
                      <button
                        key={`${r.kind}-${r.fileId}-${r.date}`}
                        onClick={() => goToFile(r)}
                        className="flex items-center gap-3 rounded-card border border-border bg-white p-3 text-left shadow-card transition hover:border-navy"
                      >
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
                          style={{ backgroundColor: STATUS_HEX[r.status] }}
                          aria-hidden
                        >
                          {glyph(r.kind)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-blue">{r.fileNumber}</span>
                            <span className="truncate text-[12px] text-muted">
                              {supplierOf.get(r.fileId)}
                            </span>
                          </div>
                          <div className="truncate text-[13px] text-ink">
                            {verb(r.kind)} · {r.label}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Page>
      </>
    );
  }

  // ---- Desktop: month grid ----
  return (
    <>
      <TopBar
        title="Calendar"
        subtitle={total > 0 ? `${total} shipment date${total === 1 ? '' : 's'} this month` : 'No shipment dates this month'}
      />
      <Page>
        {header}
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <div className="grid grid-cols-7 border-b border-border bg-page">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {matrix.flat().map((cell) => {
              const hits = byDay.get(cell.iso) ?? [];
              const isToday = cell.iso === today;
              const shown = hits.slice(0, 3);
              const overflow = hits.length - shown.length;
              return (
                <div
                  key={cell.iso}
                  className={
                    'min-h-[88px] border-b border-r border-divider p-1.5 ' +
                    (cell.inMonth ? 'bg-white' : 'bg-page/60')
                  }
                >
                  <div
                    className={
                      'mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold ' +
                      (isToday
                        ? 'bg-navy text-white'
                        : cell.inMonth
                          ? 'text-ink'
                          : 'text-faint')
                    }
                  >
                    {cell.day}
                  </div>
                  <div className="flex flex-col gap-1">
                    {shown.map((r) => (
                      <button
                        key={`${r.kind}-${r.fileId}-${r.date}`}
                        onClick={() => goToFile(r)}
                        title={`${r.fileNumber} · ${supplierOf.get(r.fileId)} · ${verb(r.kind)} · ${r.label}`}
                        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] font-semibold text-white transition hover:opacity-90"
                        style={{ backgroundColor: STATUS_HEX[r.status] }}
                      >
                        <span aria-hidden>{glyph(r.kind)}</span>
                        <span className="truncate">{r.fileNumber}</span>
                      </button>
                    ))}
                    {overflow > 0 && (
                      <span className="px-1 text-[10px] font-semibold text-muted">+{overflow} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden>▲</span> departs
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden>▼</span> arrives
          </span>
          {(['red', 'amber', 'green'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_HEX[s] }} aria-hidden />
              {s === 'red' ? 'overdue / due' : s === 'amber' ? 'soon' : 'on track'}
            </span>
          ))}
        </div>
      </Page>
    </>
  );
}
