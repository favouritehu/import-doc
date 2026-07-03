// Per-file live tracking (Terminal49), driven by the file's BL. Shown on the file
// Summary. If not yet tracking, one click starts it (BL + carrier pre-filled from
// the file). Once tracking, shows vessel / ETA / ports / last event.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Ship, Square } from 'lucide-react';
import type { ImportFile } from '../types';
import { useStore } from '../store/store';
import { CARRIERS, scacFor, carrierName } from '../lib/scac';
import {
  trackingForFile,
  trackFromFile,
  refreshTracking,
  stopTracking,
  ApiError,
  type TrackedRow,
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

export function ShipmentTracking({ file }: { file: ImportFile }) {
  const { serverMode, showToast } = useStore();
  const [row, setRow] = useState<TrackedRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scac, setScac] = useState(() => scacFor(file.shippingLine) ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRow(await trackingForFile(file.id));
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [file.id]);

  useEffect(() => {
    if (serverMode) void load();
    else setLoading(false);
  }, [serverMode, load]);

  // Tracking needs the shared server; hide entirely in per-browser mode.
  if (!serverMode) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Tracking action failed');
    } finally {
      setBusy(false);
    }
  };

  const container = file.containerNo?.trim();
  const start = () => {
    const s = scac.trim().toUpperCase();
    if (!s) {
      showToast('Pick the shipping line first');
      return;
    }
    if (!container && !file.blAwb) {
      showToast('Add a container or BL / AWB number to the file first');
      return;
    }
    // Prefer the container number; fall back to the BL.
    const payload = container
      ? { importFileId: file.id, containerNumber: container, scac: s }
      : { importFileId: file.id, blNumber: file.blAwb || undefined, scac: s };
    void run(() => trackFromFile(payload).then(setRow));
  };

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Ship size={16} className="text-navy" />
        <h3 className="font-display text-sm font-bold text-ink">Live tracking</h3>
        {row && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: CHIP[row.terminal49_status].bg, color: CHIP[row.terminal49_status].fg }}
          >
            {CHIP[row.terminal49_status].label}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid place-items-center py-4 text-muted">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : row ? (
        <Tracked row={row} busy={busy} onRefresh={() => run(() => refreshTracking(row.local_shipment_id))} onStop={() => run(() => stopTracking(row.local_shipment_id, 'completed'))} />
      ) : (
        <div>
          <p className="text-xs text-muted">
            Track this shipment on the carrier via its{' '}
            {container ? `container ${container}` : file.blAwb ? `BL ${file.blAwb}` : 'container / BL'}. Live
            tracking is capped at 10 shipments — extra ones queue automatically.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-muted">Shipping line</span>
              <select
                value={scac}
                onChange={(e) => setScac(e.target.value)}
                className="rounded-card border border-border px-3 py-2 text-sm outline-none focus:border-navy"
              >
                <option value="">Select carrier…</option>
                {CARRIERS.map((c) => (
                  <option key={c.scac} value={c.scac}>
                    {c.name} ({c.scac})
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={start}
              disabled={busy || !scac}
              className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-blue disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Ship size={14} />} Start tracking
            </button>
          </div>
          {!container && !file.blAwb && (
            <p className="mt-2 text-[11px] text-amber">No container or BL / AWB on this file yet — add it (Edit) for best results.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Tracked({
  row,
  busy,
  onRefresh,
  onStop,
}: {
  row: TrackedRow;
  busy: boolean;
  onRefresh: () => void;
  onStop: () => void;
}) {
  const s = row.last_event_snapshot;
  return (
    <div>
      <div className="text-[11px] text-muted">
        {row.request_type === 'bill_of_lading' ? 'BL' : row.request_type === 'booking_number' ? 'Booking' : 'Container'}{' '}
        {row.request_number} · {carrierName(row.scac ?? '')}
      </div>
      {s ? (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          <Fact label="Vessel" value={s.vessel} />
          <Fact label="POL" value={s.portOfLading} />
          <Fact label="POD" value={s.portOfDischarge} />
          <Fact label="ETA" value={fmt(s.podEta)} />
          {s.podArrivedAt && <Fact label="Arrived" value={fmt(s.podArrivedAt)} />}
          {s.containers?.[0]?.availableForPickup && <Fact label="Pickup" value="Available" />}
          {s.containers?.[0]?.lastFreeDay && <Fact label="Last free day" value={fmt(s.containers[0].lastFreeDay)} />}
        </div>
      ) : row.terminal49_status === 'queued' ? (
        <p className="mt-2 text-xs text-muted">Queued — starts live tracking as a slot frees up.</p>
      ) : row.terminal49_status === 'failed' ? (
        <p className="mt-2 text-xs font-semibold text-red">{row.failed_reason ?? 'Tracking failed'}</p>
      ) : (
        <p className="mt-2 text-xs text-muted">Fetching carrier data… tap Refresh in a minute.</p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onRefresh}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-medium hover:border-navy hover:text-navy disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
        </button>
        {(row.terminal49_status === 'active' || row.terminal49_status === 'queued') && (
          <button
            onClick={onStop}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-medium hover:border-red hover:text-red disabled:opacity-50"
          >
            <Square size={12} /> Stop
          </button>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] text-faint">{label}</div>
      <div className="font-semibold text-ink">{value || '—'}</div>
    </div>
  );
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
