import { Plane, Ship, Trash2 } from 'lucide-react';
import type { ImportFile } from '../types';
import { derivePriority, deriveStatus, responsibleOf } from '../lib/derive';
import { fileValueInr, inr } from '../lib/format';
import { PriorityBadge, StatusBadge } from './Badge';
import { ProgressBar } from './ProgressStepper';

export function ImportFileCard({
  file,
  showInr,
  onClick,
  onDelete,
}: {
  file: ImportFile;
  showInr: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}) {
  const status = deriveStatus(file);
  const prio = derivePriority(file);
  const [who, role] = responsibleOf(file);
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
      {/* eyebrow: file number is now small + muted, no longer the headline */}
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

      {/* every invoice: supplier (primary) · product (secondary) · weight (chip) */}
      <div className="mt-1.5 flex flex-col gap-2">
        {invoices.map((inv, i) => (
          <div
            key={inv.id ?? i}
            className="border-border/60 border-t pt-2 first:border-0 first:pt-0"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold leading-snug text-ink">
                {inv.supplier || '—'}
              </span>
              {inv.invoiceNumber && (
                <span className="shrink-0 text-[11px] font-medium text-faint">{inv.invoiceNumber}</span>
              )}
            </div>
            {(inv.product || inv.weight) && (
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-medium">{inv.product || '—'}</span>
                {inv.weight && (
                  <span className="shrink-0 rounded-full bg-page px-1.5 py-px text-[10px] font-semibold text-muted">
                    {inv.weight}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        {showInr && <span className="text-sm font-bold text-ink">{inr(fileValueInr(file))}</span>}
      </div>

      <ProgressBar status={status} />

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>ETA {file.eta}</span>
        <span className="truncate">
          {who}
          {role && ` · ${role}`}
        </span>
      </div>
    </div>
  );
}
