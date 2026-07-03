// One upload to update a shipment: pick several docs, AI reads each (browser OCR
// -> DeepSeek), files it into the right document slot, and proposes field updates
// from what it read. No Gemini vision needed.

import { useState } from 'react';
import { FileCheck2, Loader2, Upload, Wand2 } from 'lucide-react';
import type { ImportFile, Invoice } from '../types';
import { Modal } from './Overlay';
import { Button } from './Button';
import { useStore } from '../store/store';
import { extractText } from '../lib/ocr';
import { aiClassifyText, aiExtractText, AiError, type ClassifyResult } from '../lib/ai';
import { docLabel } from '../lib/docs';

const FIELD_DEFS: { key: string; label: string }[] = [
  { key: 'blAwb', label: 'BL / AWB' },
  { key: 'containerNo', label: 'Container no' },
  { key: 'shippingLine', label: 'Shipping line' },
  { key: 'forwarder', label: 'Forwarder' },
  { key: 'portLoading', label: 'Port of loading' },
  { key: 'portArrival', label: 'Port of arrival' },
  { key: 'etd', label: 'ETD' },
  { key: 'eta', label: 'ETA' },
  { key: 'cha', label: 'CHA' },
  { key: 'country', label: 'Origin country' },
];

/** Match a classified CI/PL to one of the file's invoices (by number, then supplier). */
function matchInvoice(invoices: Invoice[], c: ClassifyResult): Invoice | null {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cn = norm(c.invoiceNumber);
  if (cn) {
    const byNum = invoices.find((i) => {
      const n = norm(i.invoiceNumber);
      return n && (n === cn || n.includes(cn) || cn.includes(n));
    });
    if (byNum) return byNum;
  }
  const cs = norm(c.supplier);
  if (cs) {
    const bySup = invoices.find((i) => {
      const s = norm(i.supplier);
      return s && (s.includes(cs) || cs.includes(s));
    });
    if (bySup) return bySup;
  }
  return invoices.length === 1 ? invoices[0] : null;
}

interface FieldChange {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function BulkUpdateModal({ file, onClose }: { file: ImportFile; onClose: () => void }) {
  const { uploadFile, updateFile, addDocument, showToast } = useStore();
  const [phase, setPhase] = useState<'pick' | 'scanning' | 'review'>('pick');
  const [progress, setProgress] = useState('');
  const [filed, setFiled] = useState<string[]>([]);
  const [changes, setChanges] = useState<FieldChange[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  const onPick = async (fl: FileList | null) => {
    const arr = Array.from(fl ?? []);
    if (!arr.length) return;
    setPhase('scanning');
    setNote(null);

    const labels: string[] = [];
    let allText = '';
    for (const f of arr) {
      try {
        setProgress(`Reading ${f.name}…`);
        const text = await extractText([f], setProgress).catch(() => '');
        allText += `\n\n=== ${f.name} ===\n${text}`;

        let cls: ClassifyResult | null = null;
        try {
          cls = text ? await aiClassifyText(text) : null;
        } catch {
          cls = null;
        }
        const known = !!cls && cls.docType !== 'other';
        const type = known ? cls!.docType : `custom-${Date.now()}-${labels.length}`;
        const label = known ? docLabel(cls!.docType) : f.name.replace(/\.[^.]+$/, '');

        const up = await uploadFile(f); // server volume (or inline)
        let invoiceId: string | undefined;
        if (cls && (cls.docType === 'commercial_invoice' || cls.docType === 'packing_list')) {
          invoiceId = matchInvoice(file.invoices, cls)?.id;
        }
        addDocument(file.id, { type, label, invoiceId, fileName: up.fileName, fileUrl: up.fileUrl });
        labels.push(label);
      } catch {
        /* skip a file that fails to read/upload */
      }
    }
    setFiled(labels);

    // Propose field updates from everything we read.
    setProgress('Reading shipment details…');
    const ch: FieldChange[] = [];
    try {
      const ext = await aiExtractText(allText);
      const ef = ext.file as unknown as Record<string, string>;
      const cur = file as unknown as Record<string, string>;
      for (const def of FIELD_DEFS) {
        const to = (ef[def.key] ?? '').trim();
        const from = String(cur[def.key] ?? '').trim();
        if (to && to !== from) ch.push({ key: def.key, label: def.label, from: from || '—', to });
      }
    } catch (e) {
      setNote(e instanceof AiError ? e.message : 'Could not read field updates.');
    }
    setChanges(ch);
    setPicked(Object.fromEntries(ch.map((c) => [c.key, true])));
    setProgress('');
    setPhase('review');
  };

  const apply = () => {
    const patch: Record<string, unknown> = {};
    for (const c of changes) if (picked[c.key]) patch[c.key] = c.to;
    const n = Object.keys(patch).length;
    if (n) updateFile(file.id, patch);
    showToast(`Filed ${filed.length} doc${filed.length === 1 ? '' : 's'}${n ? ` · updated ${n} field${n === 1 ? '' : 's'}` : ''}`);
    onClose();
  };

  return (
    <Modal
      title="Scan documents to update"
      subtitle="Upload the shipment's docs — AI files each one and proposes field updates"
      onClose={onClose}
      footer={
        phase === 'review' ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </div>
        ) : null
      }
    >
      {phase === 'pick' && (
        <label className="grid cursor-pointer place-items-center gap-2 rounded-card border border-dashed border-divider bg-page py-10 text-center">
          <Upload size={24} className="text-faint" />
          <span className="text-sm font-semibold text-medium">Choose documents (PDF or photos)</span>
          <span className="max-w-xs text-xs text-muted">
            Commercial invoice, packing list, BL, certificates… select several at once — each is filed
            automatically.
          </span>
          <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => void onPick(e.target.files)} />
        </label>
      )}

      {phase === 'scanning' && (
        <div className="grid place-items-center gap-2 py-10 text-center">
          <Loader2 className="animate-spin text-navy" />
          <p className="text-sm font-semibold text-medium">Scanning…</p>
          <p className="text-xs text-muted">{progress || 'Working…'}</p>
        </div>
      )}

      {phase === 'review' && (
        <div className="grid gap-4">
          <div>
            <h4 className="mb-1.5 flex items-center gap-1.5 font-display text-sm font-bold text-ink">
              <FileCheck2 size={15} className="text-green" /> Filed {filed.length} document{filed.length === 1 ? '' : 's'}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {filed.map((l, i) => (
                <span key={i} className="rounded-full bg-page px-2 py-0.5 text-[11px] font-semibold text-medium">
                  {l}
                </span>
              ))}
            </div>
          </div>

          {changes.length ? (
            <div>
              <h4 className="mb-1.5 flex items-center gap-1.5 font-display text-sm font-bold text-ink">
                <Wand2 size={15} className="text-navy" /> Suggested field updates
              </h4>
              <div className="flex flex-col gap-1.5">
                {changes.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded-card border border-border p-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!picked[c.key]}
                      onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.checked }))}
                    />
                    <span className="font-semibold text-ink">{c.label}</span>
                    <span className="ml-auto truncate text-muted">{c.from}</span>
                    <span className="text-faint">→</span>
                    <span className="truncate font-semibold text-navy">{c.to}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">{note ?? 'No new field values found — documents were filed.'}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
