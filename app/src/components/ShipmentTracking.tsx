// Shipment tracking — free-carrier flow, journey view. Shows WHERE the shipment
// is between origin and destination (position = elapsed share of the ETD→ETA
// window, colored like the arrival rail), the vessel, and the latest carrier
// milestone. Data arrives via the Chrome extension or "Paste update" (AI reads
// the carrier page); ETA/ETD/arrival feed deriveStatus, the rail and reminders.

import { useState } from 'react';
import { ClipboardList, Copy, ExternalLink, Ship } from 'lucide-react';
import type { ImportFile } from '../types';
import { useStore, TODAY } from '../store/store';
import { scacFor } from '../lib/scac';
import { carrierTrackingUrl } from '../lib/trackingLinks';
import { aiUpdate, type UpdateFields } from '../lib/ai';
import { Modal } from './Overlay';
import { Button } from './Button';
import { daysBetween, fmtDate, parseDate, todayIso } from '../lib/dates';

export function ShipmentTracking({ file }: { file: ImportFile }) {
  const { showToast } = useStore();
  const [pasteOpen, setPasteOpen] = useState(false);
  const container = file.containerNo?.trim();
  const num = container || file.blAwb;

  // Many carrier pages ignore URL params — the user pastes the CONTAINER number
  // into the page's own search box, so hand exactly that to the clipboard.
  const copyNum = async () => {
    if (!container) return;
    try {
      await navigator.clipboard.writeText(container);
      showToast(`Copied ${container}`);
    } catch {
      showToast('Could not copy — long-press the number instead');
    }
  };

  // ── Journey math: where is the ship between ETD and ETA? ──
  const today = parseDate(todayIso());
  const dEtd = parseDate(file.etd);
  const dEta = parseDate(file.eta);
  const arrived = !!file.arrivedOn;
  const daysLeft = dEta ? daysBetween(todayIso(), file.eta) : null;

  let pct = 0;
  if (arrived) pct = 100;
  else if (today && dEtd && dEta && dEta.getTime() > dEtd.getTime()) {
    pct = Math.round(((today.getTime() - dEtd.getTime()) / (dEta.getTime() - dEtd.getTime())) * 100);
    pct = Math.max(3, Math.min(pct, 97)); // keep the dot visible inside the bar
  } else if (daysLeft !== null) {
    pct = daysLeft <= 0 ? 97 : 50;
  }

  const color = arrived ? '#16A34A' : daysLeft !== null && daysLeft <= 4 ? '#DC3A45' : '#16A34A';
  const plural = (n: number) => (Math.abs(n) === 1 ? 'day' : 'days');
  const statusLabel = arrived
    ? `Arrived ${fmtDate(file.arrivedOn!) || file.arrivedOn}`
    : daysLeft === null
      ? 'No ETA yet'
      : daysLeft < 0
        ? `Overdue ${Math.abs(daysLeft)} ${plural(daysLeft)}`
        : daysLeft === 0
          ? 'Arrives today'
          : `Arrives in ${daysLeft} ${plural(daysLeft)}`;

  const hasJourney = !!(dEtd || dEta);

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <Ship size={16} className="text-navy" />
        <h3 className="font-display text-sm font-bold text-ink">Tracking</h3>
        {file.vessel && <span className="truncate text-xs font-semibold text-medium">· {file.vessel}</span>}
        {num && <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">{num}</span>}
      </div>

      {/* Origin ──●── Destination journey bar */}
      {hasJourney && (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-ink">
            <span className="truncate">{file.portLoading || 'Origin'}</span>
            <span className="truncate text-right">{file.portArrival || 'Destination'}</span>
          </div>
          <div className="relative my-2 h-1.5 rounded-full bg-page">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `calc(${pct}% - 7px)`, background: color }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px]">
            <span className="text-muted">
              ETD {file.etd ? fmtDate(file.etd) || file.etd : '—'}
            </span>
            <span className="font-bold" style={{ color }}>
              {statusLabel}
              {!arrived && file.eta ? ` · ETA ${fmtDate(file.eta) || file.eta}` : ''}
            </span>
          </div>
        </div>
      )}

      {/* Latest carrier milestone — full line, never truncated into oblivion */}
      {file.lastTrackingEvent && (
        <div className="mb-3 flex items-start gap-2 rounded-card bg-page px-3 py-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
          <p className="min-w-0 text-xs font-semibold text-ink">
            {file.lastTrackingEvent}
            {file.lastTrackingAt && (
              <span className="block text-[10px] font-normal text-faint">updated {file.lastTrackingAt}</span>
            )}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {num && (
          <a
            href={carrierTrackingUrl(scacFor(file.shippingLine), num)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-navy px-3.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue"
          >
            <ExternalLink size={12} /> Open tracking
          </a>
        )}
        {container && (
          <button
            onClick={() => void copyNum()}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-[11px] font-semibold text-medium hover:border-navy hover:text-navy"
          >
            <Copy size={12} /> Copy no
          </button>
        )}
        <button
          onClick={() => setPasteOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-[11px] font-semibold text-medium hover:border-navy hover:text-navy"
        >
          <ClipboardList size={12} /> Paste update
        </button>
        {!num && (
          <span className="text-[11px] text-amber">Add a container or BL number (Edit) to enable tracking.</span>
        )}
        {num && !file.lastTrackingEvent && (
          <span className="text-[11px] text-muted">
            Open the carrier page, then send it back with the Chrome extension — or Paste update.
          </span>
        )}
      </div>
      {pasteOpen && <PasteTrackingModal file={file} onClose={() => setPasteOpen(false)} />}
    </div>
  );
}

// Free tracking capture: paste the carrier tracking page's text; DeepSeek pulls
// ETD / ETA / arrival / vessel / latest event; Apply writes them onto the file.
function PasteTrackingModal({ file, onClose }: { file: ImportFile; onClose: () => void }) {
  const { updateFile } = useStore();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fields, setFields] = useState<UpdateFields | null>(null);

  const read = async () => {
    setBusy(true);
    setErr(null);
    try {
      setFields(await aiUpdate(text));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows: { label: string; value?: string }[] = fields
    ? [
        { label: 'ETD (departure)', value: fields.etd },
        { label: 'ETA', value: fields.eta },
        { label: 'Arrived on', value: fields.arrivedOn },
        { label: 'Vessel', value: fields.vessel },
        { label: 'Latest event', value: fields.latestEvent },
      ].filter((r) => r.value)
    : [];

  const apply = () => {
    if (!fields) return;
    const patch: Partial<ImportFile> = { lastTrackingAt: TODAY };
    if (fields.etd) patch.etd = fields.etd;
    if (fields.eta) patch.eta = fields.eta;
    if (fields.arrivedOn) patch.arrivedOn = fields.arrivedOn;
    if (fields.vessel) patch.vessel = fields.vessel;
    if (fields.latestEvent) patch.lastTrackingEvent = fields.latestEvent;
    updateFile(file.id, patch);
    onClose();
  };

  return (
    <Modal
      title="Paste tracking update"
      subtitle="Copy the carrier tracking page (Cmd/Ctrl+A then C) and paste it here"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {fields ? (
            <Button onClick={apply} disabled={rows.length === 0}>
              Apply to shipment
            </Button>
          ) : (
            <Button onClick={() => void read()} disabled={busy || text.trim().length < 20}>
              {busy ? 'Reading…' : 'Read with AI'}
            </Button>
          )}
        </div>
      }
    >
      {fields ? (
        rows.length ? (
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center gap-2 rounded-card border border-border p-2 text-xs">
                <span className="font-semibold text-ink">{r.label}</span>
                <span className="ml-auto truncate font-semibold text-navy">{r.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">Nothing recognisable found — paste more of the page and try again.</p>
        )
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste the tracking page text here…"
            className="w-full rounded-card border border-border p-3 text-xs outline-none focus:border-navy"
          />
          {err && <p className="mt-1 text-xs font-semibold text-red">{err}</p>}
        </>
      )}
    </Modal>
  );
}
