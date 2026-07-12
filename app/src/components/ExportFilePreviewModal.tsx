import { useState } from 'react';
import { AlertTriangle, FileText } from 'lucide-react';
import type { Doc, ExportFile, ExportInvoice } from '../types';
import { CORRECTION_REASONS, docLabel, docStatusMeta } from '../lib/docs';
import { RolePolicy } from '../lib/rolePolicy';
import { useExportStore } from '../store/exportStore';
import { Badge } from './Badge';
import { Button } from './Button';
import { SlideOver } from './Overlay';

/**
 * Minimal export-domain doc slide-over. Forked from FilePreviewModal because
 * that component is hard-wired to ImportFile/Invoice (previewFields) and the
 * import store's upload/approve/flag/reupload actions — none of which exist
 * on ExportStore (which exposes only setDocStatus). No real file upload in
 * Phase 1 export: rows are marked through the status actions below.
 */
export function ExportFilePreviewModal({
  file,
  doc,
  invoiceId,
  onClose,
}: {
  file: ExportFile;
  doc: Doc;
  invoiceId?: string;
  onClose: () => void;
}) {
  const { role, setDocStatus } = useExportStore();
  const canApprove = RolePolicy.canApproveDoc(role);
  const inv: ExportInvoice | undefined = invoiceId ? file.invoices.find((i) => i.id === invoiceId) : undefined;
  const title = doc.label ?? docLabel(doc.type);

  const [flagging, setFlagging] = useState(false);
  const [reason, setReason] = useState(`${CORRECTION_REASONS[0].zh} · ${CORRECTION_REASONS[0].en}`);

  const set = (status: Doc['status'], r?: string) => {
    setDocStatus(file.id, doc.type, status, { invoiceId, reason: r });
    onClose();
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
            <Button variant="danger" onClick={() => set('discrepant', reason)}>
              Flag discrepancy
            </Button>
          </div>
        </div>
      );
    }

    switch (doc.status) {
      case 'missing':
        return (
          <div className="flex justify-end">
            <Button onClick={() => set('uploaded')}>Mark received</Button>
          </div>
        );
      case 'uploaded':
      case 'under_review':
      case 'corrected':
        return (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setFlagging(true)}>
              Flag issue
            </Button>
            {canApprove && <Button variant="green" onClick={() => set('approved')}>Approve</Button>}
          </div>
        );
      case 'discrepant':
        return (
          <div className="flex justify-end">
            <Button variant="amber" onClick={() => set('corrected')}>
              Mark corrected
            </Button>
          </div>
        );
      case 'approved':
        return null;
    }
  };

  return (
    <SlideOver
      title={title}
      subtitle={inv ? `${inv.buyer} · ${inv.invoiceNumber}` : file.fileNumber}
      onClose={onClose}
      footer={actions()}
    >
      <div className="mb-4 flex items-center justify-between">
        <Badge tint={docStatusMeta[doc.status]} />
        {doc.required && <span className="text-[11px] font-semibold text-muted">Required</span>}
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

      <div className="rounded-card border border-border bg-page p-4">
        <div className="mb-3 flex items-center gap-2 text-muted">
          <FileText size={15} />
          <span className="text-xs font-semibold uppercase tracking-wide">Document</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <div>
            <dt className="text-[11px] text-faint">File</dt>
            <dd className="truncate text-sm font-semibold text-ink">{file.fileNumber}</dd>
          </div>
          {inv && (
            <>
              <div>
                <dt className="text-[11px] text-faint">Buyer</dt>
                <dd className="truncate text-sm font-semibold text-ink">{inv.buyer}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-faint">Invoice No</dt>
                <dd className="truncate text-sm font-semibold text-ink">{inv.invoiceNumber || '—'}</dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-[11px] text-faint">Destination</dt>
            <dd className="truncate text-sm font-semibold text-ink">{file.destination}</dd>
          </div>
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
