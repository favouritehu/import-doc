import { useState, type ReactNode } from 'react';
import { AlertTriangle, FileText, Trash2, Upload, Wand2 } from 'lucide-react';
import type { Doc, ImportFile, Invoice } from '../types';
import { cx } from '../lib/cx';
import { CORRECTION_REASONS, docLabel, docStatusMeta } from '../lib/docs';
import { previewFields } from '../lib/docPreview';
import { RolePolicy } from '../lib/rolePolicy';
import { aiDiscrepancy, type Mismatch } from '../lib/ai';
import { useStore } from '../store/store';
import { Badge } from './Badge';
import { Button } from './Button';
import { SlideOver } from './Overlay';

const isImage = (name?: string | null) => !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
const isPdf = (name?: string | null) => !!name && /\.pdf$/i.test(name);

const LABEL_VARIANTS = {
  primary: 'bg-navy text-white hover:bg-blue',
  amber: 'bg-amber text-navy hover:opacity-90',
  ghost: 'border border-border bg-white text-medium hover:border-navy',
} as const;

/**
 * Native <label>-wrapped file input. The label↔input association opens the OS
 * picker on click in EVERY browser (Safari included) — unlike a hidden input
 * triggered by ref.click(), which Safari ignores.
 */
function UploadLabel({
  variant,
  onFile,
  children,
}: {
  variant: keyof typeof LABEL_VARIANTS;
  onFile: (f: File) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition',
        LABEL_VARIANTS[variant],
      )}
    >
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
      {children}
    </label>
  );
}

export function FilePreviewModal({
  file,
  doc,
  invoiceId,
  onClose,
}: {
  file: ImportFile;
  doc: Doc;
  invoiceId?: string;
  onClose: () => void;
}) {
  const { role, uploadDoc, approveDoc, flagDoc, requestCorrection, reuploadDoc, clearDoc } = useStore();
  const canApprove = RolePolicy.canApproveDoc(role);
  const canDelete = RolePolicy.canDelete(role);
  const inv: Invoice | undefined = invoiceId ? file.invoices.find((i) => i.id === invoiceId) : undefined;
  const fields = previewFields(doc, file, inv);
  const target = { invoiceId };

  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState(`${CORRECTION_REASONS[0].zh} · ${CORRECTION_REASONS[0].en}`);

  // AI discrepancy check (CI/PL vs pasted PI/PO)
  const [aiOpen, setAiOpen] = useState(false);
  const [refText, setRefText] = useState('');
  const [checking, setChecking] = useState(false);
  const [mismatches, setMismatches] = useState<Mismatch[] | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const runCheck = async () => {
    setChecking(true);
    setAiErr(null);
    setMismatches(null);
    try {
      const res = await aiDiscrepancy(
        {
          supplier: inv?.supplier,
          invoiceNumber: inv?.invoiceNumber,
          invoiceDate: inv?.invoiceDate,
          product: inv?.product,
          hsn: inv?.hsn,
          amount: inv?.usd,
          currency: inv?.currency,
        },
        refText,
      );
      setMismatches(res.mismatches);
    } catch (e) {
      setAiErr((e as Error).message);
    } finally {
      setChecking(false);
    }
  };
  const aiCheckable = !!inv && (doc.status === 'uploaded' || doc.status === 'under_review' || doc.status === 'discrepant');

  // Read as a data URL (not a blob URL) so the file persists to localStorage and
  // re-renders after reload.
  const readUrl = (f: File, cb: (url: string) => void) => {
    const r = new FileReader();
    r.onload = () => cb(typeof r.result === 'string' ? r.result : '');
    r.readAsDataURL(f);
  };
  const doUpload = (f: File) =>
    readUrl(f, (url) => uploadDoc(file.id, doc.type, { ...target, fileName: f.name, fileUrl: url }));
  const doReupload = (f: File) =>
    readUrl(f, (url) => reuploadDoc(file.id, doc.type, { ...target, fileName: f.name, fileUrl: url }));

  const actions = () => {
    if (flagging) {
      return (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted">Reason for discrepancy</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-card border border-border bg-white px-3 py-2 text-sm outline-none focus:border-navy"
          >
            {CORRECTION_REASONS.map((r) => (
              <option key={r.en} value={`${r.zh} · ${r.en}`}>
                {r.zh} · {r.en}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFlagging(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                flagDoc(file.id, doc.type, reason, target);
                setFlagging(false);
              }}
            >
              Flag discrepancy
            </Button>
          </div>
        </div>
      );
    }

    switch (doc.status) {
      case 'missing':
        return (
          <UploadLabel variant="primary" onFile={doUpload}>
            <Upload size={15} /> Choose file &amp; upload
          </UploadLabel>
        );
      case 'uploaded':
      case 'under_review':
      case 'corrected':
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {canDelete && (
              <Button variant="ghost" onClick={() => clearDoc(file.id, doc.type, invoiceId)}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
            <Button variant="ghost" onClick={() => setFlagging(true)}>
              Flag issue
            </Button>
            {canApprove && <Button variant="green" onClick={() => approveDoc(file.id, doc.type, target)}>Approve</Button>}
          </div>
        );
      case 'discrepant':
        return (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => requestCorrection(file.id, doc.type, target)}>
              Request correction
            </Button>
            <UploadLabel variant="amber" onFile={doReupload}>
              <Upload size={14} /> Re-upload corrected file
            </UploadLabel>
          </div>
        );
      case 'approved':
        return (
          <div className="flex flex-wrap justify-end gap-2">
            {canDelete && (
              <Button variant="ghost" onClick={() => clearDoc(file.id, doc.type, invoiceId)}>
                <Trash2 size={14} /> Remove
              </Button>
            )}
            <UploadLabel variant="ghost" onFile={doReupload}>
              <Upload size={14} /> Re-upload new version
            </UploadLabel>
          </div>
        );
    }
  };

  return (
    <SlideOver
      title={docLabel(doc.type)}
      subtitle={inv ? `${inv.supplier} · ${inv.invoiceNumber}` : file.fileNumber}
      onClose={onClose}
      footer={actions()}
    >
      <div className="mb-4 flex items-center justify-between">
        <Badge tint={docStatusMeta[doc.status]} />
        <span className="text-[11px] text-muted">v{doc.version ?? 1}</span>
      </div>

      {doc.status === 'discrepant' && (
        <div className="mb-4 flex items-start gap-2 rounded-card border border-red/30 bg-red/5 p-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red" />
          <div>
            <p className="text-sm font-bold text-red">Discrepancy flagged</p>
            <p className="text-xs text-medium">{doc.reason}</p>
          </div>
        </div>
      )}

      {/* Real uploaded file preview when present */}
      {doc.fileUrl && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="truncate text-xs font-semibold text-medium">{doc.fileName}</span>
            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-navy hover:underline">
              Open
            </a>
          </div>
          {isImage(doc.fileName) ? (
            <img src={doc.fileUrl} alt={doc.fileName ?? ''} className="max-h-72 w-full rounded-card border border-border object-contain bg-page" />
          ) : isPdf(doc.fileName) ? (
            <iframe title={doc.fileName ?? 'pdf'} src={doc.fileUrl} className="h-72 w-full rounded-card border border-border" />
          ) : (
            <div className="rounded-card border border-border bg-page p-4 text-sm text-muted">File attached — open to view.</div>
          )}
        </div>
      )}

      <div className="rounded-card border border-border bg-page p-4">
        <div className="mb-3 flex items-center gap-2 text-muted">
          <FileText size={15} />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {doc.fileUrl ? 'Extracted fields' : 'Document preview'}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] text-faint">{f.label}</dt>
              <dd className="truncate text-sm font-semibold text-ink">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {aiCheckable && (
        <div className="mt-4 rounded-card border border-border p-3">
          <button
            onClick={() => setAiOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm font-semibold text-navy"
          >
            <Wand2 size={14} /> Check vs Proforma / PO (AI)
          </button>
          {aiOpen && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={refText}
                onChange={(e) => setRefText(e.target.value)}
                placeholder="Paste the PI / PO text to compare against this invoice…"
                className="h-24 w-full rounded-card border border-border p-2 text-sm outline-none focus:border-navy"
              />
              <div className="flex justify-end">
                <Button variant="ghost" disabled={!refText.trim() || checking} onClick={runCheck}>
                  {checking ? 'Checking…' : 'Check'}
                </Button>
              </div>
              {aiErr && <p className="text-xs text-red">{aiErr}</p>}
              {mismatches && mismatches.length === 0 && (
                <p className="text-xs font-semibold text-green">No mismatches found.</p>
              )}
              {mismatches?.map((m, i) => (
                <div key={i} className="rounded-card border border-red/30 bg-red/5 p-2 text-xs">
                  <div className="font-semibold text-red">
                    {m.field}: “{m.invoiceValue}” vs “{m.referenceValue}”
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-muted">
                      {m.reasonZh} · {m.reasonEn}
                    </span>
                    <button
                      onClick={() => {
                        flagDoc(file.id, doc.type, `${m.reasonZh} · ${m.reasonEn}`, target);
                        onClose();
                      }}
                      className="shrink-0 font-semibold text-red hover:underline"
                    >
                      Flag
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">History</h4>
        <ul className="space-y-2 text-xs text-medium">
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-divider" />
            Checklist created · slot requested
          </li>
          {doc.by && (
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-navy" />
              {docStatusMeta[doc.status].label} · {doc.by} · {doc.at}
            </li>
          )}
          {doc.reason && (
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red" />
              {doc.reason}
            </li>
          )}
        </ul>
      </div>
    </SlideOver>
  );
}
