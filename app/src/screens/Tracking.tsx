// Container-tracking admin dashboard (Terminal49). Unlimited local shipments, but
// only `limit` (10) live-tracked at once — the rest queue. Add shipments, stop
// completed ones (frees a slot -> auto-activates the next queued), refresh, and
// manually pull the queue forward.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Play, Square, Ship, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { cx } from '../lib/cx';
import { useStore } from '../store/store';
import {
  listTracking,
  addTracking,
  stopTracking,
  refreshTracking,
  activateNextTracking,
  deleteTracking,
  ApiError,
  type TrackedRow,
  type TrackSummary,
  type TrackStatus,
} from '../lib/api';

const CHIP: Record<TrackStatus, { label: string; bg: string; fg: string }> = {
  active: { label: 'Live', bg: '#E6F4EA', fg: '#16A34A' },
  queued: { label: 'Queued', bg: '#FDF1DD', fg: '#B4740F' },
  completed: { label: 'Completed', bg: '#EAF0FB', fg: '#1E4175' },
  stopped: { label: 'Stopped', bg: '#EEF0F3', fg: '#5A6172' },
  failed: { label: 'Failed', bg: '#FCE9EA', fg: '#DC3A45' },
  not_tracked: { label: 'Not tracked', bg: '#EEF0F3', fg: '#8B92A1' },
};

export function Tracking() {
  const { role, showToast } = useStore();
  const [rows, setRows] = useState<TrackedRow[]>([]);
  const [sum, setSum] = useState<TrackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // row id or global action

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { summary, rows } = await listTracking();
      setSum(summary);
      setRows(rows);
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'unconfigured')
        setErr('Enable shared data (Postgres) in the deploy to use container tracking.');
      else if (e instanceof ApiError && e.kind === 'network') setErr('Cannot reach the tracking service.');
      else setErr('Could not load tracking.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  if (role !== 'admin') {
    return (
      <>
        <TopBar title="Container Tracking" />
        <Page>
          <div className="rounded-card border border-border bg-white p-6 text-center text-sm text-muted shadow-card">
            Container tracking is managed by the Owner.
          </div>
        </Page>
      </>
    );
  }

  const groups: { key: TrackStatus[]; title: string }[] = [
    { key: ['active'], title: 'Live tracked' },
    { key: ['queued'], title: 'Queued' },
    { key: ['completed', 'stopped'], title: 'Completed / stopped' },
    { key: ['failed'], title: 'Failed' },
  ];

  return (
    <>
      <TopBar title="Container Tracking" subtitle="Terminal49 · live limit" />
      <Page>
        {err ? (
          <div className="rounded-card border border-amber/40 bg-amber/5 p-4 text-sm text-medium">
            <AlertTriangle size={16} className="mb-1 inline text-amber" /> {err}
          </div>
        ) : (
          <>
            {sum && (
              <div className="mb-4 rounded-card border border-border bg-white p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-faint">Active Terminal49 slots</div>
                    <div className="font-display text-2xl font-bold text-ink">
                      {sum.active} <span className="text-base font-semibold text-muted">/ {sum.limit}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => act('activate', () => activateNextTracking())}
                      disabled={busy !== null || sum.queued === 0 || sum.active >= sum.limit}
                    >
                      {busy === 'activate' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      Activate next
                    </Button>
                    <Button variant="ghost" onClick={() => void load()} disabled={busy !== null}>
                      <RefreshCw size={14} /> Reload
                    </Button>
                  </div>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-page">
                  <div
                    className="h-full rounded-full bg-navy transition-all"
                    style={{ width: `${Math.min(100, (sum.active / Math.max(1, sum.limit)) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                  <span>Queued {sum.queued}</span>
                  <span>Completed {sum.completed}</span>
                  <span>Stopped {sum.stopped}</span>
                  <span className={cx(sum.failed > 0 && 'font-semibold text-red')}>Failed {sum.failed}</span>
                </div>
              </div>
            )}

            <AddTrackingForm busy={busy === 'add'} onAdd={(input) => act('add', () => addTracking(input))} />

            {loading ? (
              <div className="mt-6 grid place-items-center py-10 text-muted">
                <Loader2 className="animate-spin" />
              </div>
            ) : (
              groups.map((g) => {
                const list = rows.filter((r) => g.key.includes(r.terminal49_status));
                if (list.length === 0) return null;
                return (
                  <div key={g.title} className="mt-5">
                    <h3 className="mb-2 font-display text-sm font-bold text-ink">
                      {g.title} <span className="text-muted">({list.length})</span>
                    </h3>
                    <div className="flex flex-col gap-2">
                      {list.map((r) => (
                        <TrackRow
                          key={r.local_shipment_id}
                          row={r}
                          busy={busy === r.local_shipment_id}
                          onStop={(status) => act(r.local_shipment_id, () => stopTracking(r.local_shipment_id, status))}
                          onRefresh={() => act(r.local_shipment_id, () => refreshTracking(r.local_shipment_id))}
                          onDelete={() => act(r.local_shipment_id, () => deleteTracking(r.local_shipment_id))}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </Page>
    </>
  );
}

function TrackRow({
  row,
  busy,
  onStop,
  onRefresh,
  onDelete,
}: {
  row: TrackedRow;
  busy: boolean;
  onStop: (status: 'stopped' | 'completed') => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const chip = CHIP[row.terminal49_status];
  const snap = row.last_event_snapshot;
  const ident = row.bl_number || row.booking_number || row.container_number || '—';
  const kind = row.bl_number ? 'BL' : row.booking_number ? 'Booking' : 'Container';
  return (
    <div className="rounded-card border border-border bg-white p-3 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Ship size={14} className="shrink-0 text-muted" />
            <span className="truncate font-mono text-sm font-semibold text-ink">{ident}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: chip.bg, color: chip.fg }}
            >
              {chip.label}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {kind} · {row.scac}
            {snap?.shippingLine ? ` · ${snap.shippingLine}` : ''}
          </div>
          {snap && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-medium">
              {snap.portOfLading && <span>POL {snap.portOfLading}</span>}
              {snap.portOfDischarge && <span>POD {snap.portOfDischarge}</span>}
              {snap.podEta && <span>ETA {fmt(snap.podEta)}</span>}
              {snap.vessel && <span>Vessel {snap.vessel}</span>}
            </div>
          )}
          {row.terminal49_status === 'failed' && row.failed_reason && (
            <div className="mt-1 text-[11px] font-semibold text-red">{row.failed_reason}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {row.terminal49_status === 'active' && (
            <>
              <button
                onClick={() => onRefresh()}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-medium hover:border-navy hover:text-navy disabled:opacity-50"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
              </button>
              <button
                onClick={() => onStop('completed')}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-medium hover:border-red hover:text-red disabled:opacity-50"
              >
                <Square size={12} /> Stop
              </button>
            </>
          )}
          {(row.terminal49_status === 'failed' ||
            row.terminal49_status === 'stopped' ||
            row.terminal49_status === 'completed') && (
            <button
              onClick={() => onDelete()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-medium hover:border-red hover:text-red disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AddTrackingForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (input: { blNumber?: string; bookingNumber?: string; containerNumber?: string; scac: string }) => void;
}) {
  const [bl, setBl] = useState('');
  const [booking, setBooking] = useState('');
  const [container, setContainer] = useState('');
  const [scac, setScac] = useState('');
  const inp = 'w-full rounded-card border border-border px-3 py-2 text-sm outline-none focus:border-navy';
  const valid = (bl.trim() || booking.trim() || container.trim()) && scac.trim().length >= 2;
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <h3 className="mb-1 font-display text-sm font-bold text-ink">Track a shipment</h3>
      <p className="mb-3 text-[11px] text-muted">
        Master BL preferred, then booking, then container. Carrier code (SCAC) required. Over the live
        limit it queues automatically.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-muted">Master BL no</span>
          <input value={bl} onChange={(e) => setBl(e.target.value)} className={inp} placeholder="e.g. MEDUXXXXXXX" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-muted">Booking no</span>
          <input value={booking} onChange={(e) => setBooking(e.target.value)} className={inp} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-muted">Container no</span>
          <input value={container} onChange={(e) => setContainer(e.target.value)} className={inp} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-muted">Carrier SCAC</span>
          <input
            value={scac}
            onChange={(e) => setScac(e.target.value.toUpperCase())}
            className={inp}
            placeholder="e.g. MAEU"
            maxLength={4}
          />
        </label>
      </div>
      <div className="mt-3">
        <Button
          disabled={!valid || busy}
          onClick={() => {
            onAdd({ blNumber: bl.trim() || undefined, bookingNumber: booking.trim() || undefined, containerNumber: container.trim() || undefined, scac: scac.trim() });
            setBl('');
            setBooking('');
            setContainer('');
            setScac('');
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Track
        </Button>
      </div>
    </div>
  );
}

function fmt(iso: string): string {
  // Display Terminal49 ISO timestamps as a short date; fall back to raw.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
