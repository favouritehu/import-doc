import { Plane, Ship, Trash2 } from 'lucide-react';
import type { ExportFile } from '../types';
import { derivePriorityExport, deriveExportStatus, responsibleExportOf } from '../lib/deriveExport';
import { exportStatusMeta } from '../lib/docs';
import { exportValueInr, inr } from '../lib/format';
import { Badge, PriorityBadge } from './Badge';

export function ExportFileCard({
  file,
  showInr,
  onClick,
  onDelete,
}: {
  file: ExportFile;
  showInr: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const status = deriveExportStatus(file);
  const prio = derivePriorityExport(file);
  const [who, role] = responsibleExportOf(file);
  const Mode = file.mode === 'air' ? Plane : Ship;
  const invoices = file.invoices;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="anim-pop flex w-full cursor-pointer flex-col rounded-card border border-border bg-white p-4 text-left shadow-card transition hover:border-navy focus:outline-none focus-visible:border-navy"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <span className="text-blue">{file.fileNumber}</span>
          <Mode size={12} className="text-faint" />
          {invoices.length > 1 && (
            <span className="rounded-full bg-page px-1.5 py-px text-[10px] font-bold text-muted">
              {invoices.length} invoices
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <PriorityBadge priority={prio} />
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete file"
              className="grid h-7 w-7 place-items-center rounded-full text-faint transition hover:bg-red/10 hover:text-red"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* every invoice: buyer (primary) · product (secondary) */}
      <div className="mt-1.5 flex flex-col gap-2">
        {invoices.map((inv, i) => (
          <div key={inv.id ?? i} className="border-border/60 border-t pt-2 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold leading-snug text-ink">{inv.buyer || '—'}</span>
              {inv.invoiceNumber && (
                <span className="shrink-0 text-[11px] font-medium text-faint">{inv.invoiceNumber}</span>
              )}
            </div>
            {inv.product && <div className="mt-0.5 truncate text-xs text-medium">{inv.product}</div>}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">{file.destination}</span>
        <span>ETA {file.eta}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge tint={exportStatusMeta[status]} dot />
        {showInr && <span className="text-sm font-bold text-ink">{inr(exportValueInr(file))}</span>}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">
          {who}
          {role && ` · ${role}`}
        </span>
      </div>
    </div>
  );
}
