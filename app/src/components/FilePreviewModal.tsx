import { useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, FileText, Trash2 } from 'lucide-react';
import type { Doc, ImportFile, Invoice } from '../types';
import { CORRECTION_REASONS, docLabel, docStatusMeta } from '../lib/docs';
import { previewFields } from '../lib/docPreview';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore } from '../store/store';
import { Badge } from './Badge';
import { Button } from './Button';
import { SlideOver } from './Overlay';

const isImage = (name?: string | null) => !!name && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
const isPdf = (name?: string | null) => !!name && /\.pdf$/i.test(name);

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

  // real client-side file picker (held in memory via object URL; no backend in Phase A)
  const inputRef = useRef<HTMLInputElement>(null);
  const mode = useRef<'upload' | 'reupload'>('upload');

  const pick = (m: 'upload' | 'reupload') => {
    mode.current = m;
    inputRef.current?.click();
  };

  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    if (mode.current === 'reupload') reuploadDoc(file.id, doc.type, { ...target, fileName: f.name, fileUrl: url });
    else uploadDoc(file.id, doc.type, { ...target, fileName: f.name, fileUrl: url });
  };

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
        return <Button onClick={() => pick('upload')}>Choose file &amp; upload</Button>;
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
            <Button variant="amber" onClick={() => pick('reupload')}>
              Re-upload corrected file
            </Button>
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
            <Button variant="ghost" onClick={() => pick('reupload')}>
              Re-upload new version
            </Button>
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
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onPicked} />

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
