// Shipment tracking — free-carrier flow only. "Open tracking" jumps to the
// carrier's own free page for this container/BL; the data comes back via the
// Chrome extension (auto-capture) or "Paste update" (AI reads the pasted page).
// ETA + arrival feed deriveStatus, the arrival rail and reminders.

import { useState } from 'react';
import { ClipboardList, Copy, ExternalLink, Ship } from 'lucide-react';
import type { ImportFile } from '../types';
import { useStore, TODAY } from '../store/store';
import { scacFor } from '../lib/scac';
import { carrierTrackingUrl } from '../lib/trackingLinks';
import { aiUpdate, type UpdateFields } from '../lib/ai';
import { Modal } from './Overlay';
import { Button } from './Button';
import { fmtDate } from '../lib/dates';

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

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Ship size={16} className="text-navy" />
        <h3 className="font-display text-sm font-bold text-ink">Tracking</h3>
        {num && <span className="ml-auto font-mono text-[11px] text-muted">{num}</span>}
      </div>

      {(file.vessel || file.lastTrackingEvent) && (
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
          {file.vessel && <Fact label="Vessel" value={file.vessel} />}
          <Fact label="ETA" value={fmtDate(file.eta) || file.eta} />
          {file.arrivedOn && <Fact label="Arrived" value={fmtDate(file.arrivedOn) || file.arrivedOn} />}
          {file.lastTrackingEvent && <Fact label="Latest" value={file.lastTrackingEvent} />}
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
      {file.lastTrackingAt && (
        <p className="mt-2 text-[10px] text-faint">Last update {file.lastTrackingAt}</p>
      )}
      {pasteOpen && <PasteTrackingModal file={file} onClose={() => setPasteOpen(false)} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-faint">{label}</div>
      <div className="truncate font-semibold text-ink">{value || '—'}</div>
    </div>
  );
}

// Free tracking capture: paste the carrier tracking page's text; DeepSeek pulls
// ETA / arrival / vessel / latest event; Apply writes them onto the file.
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
