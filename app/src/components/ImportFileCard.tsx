import { Plane, Ship, Trash2 } from 'lucide-react';
import type { ImportFile } from '../types';
import { derivePriority, deriveStatus, responsibleOf } from '../lib/derive';
import { fileValueInr, inr, supplierLabel } from '../lib/format';
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
  const product =
    file.invoices.length > 1 ? `${file.invoices.length} invoices` : file.invoices[0]?.product || '—';

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
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-sm font-bold text-blue">{file.fileNumber}</span>
            <Mode size={13} className="text-faint" />
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold text-ink">{supplierLabel(file)}</div>
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

      <div className="mt-0.5 truncate text-xs text-muted">{product}</div>

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
