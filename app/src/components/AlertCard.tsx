import { AlertTriangle } from 'lucide-react';
import type { Alert } from '../types';

export function AlertCard({ alert, onClick }: { alert: Alert; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="anim-pop flex w-full items-start gap-3 rounded-card border border-border bg-white p-3 text-left shadow-card transition hover:border-navy"
      style={{ borderLeft: `3px solid ${alert.accent}` }}
    >
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{ background: `${alert.accent}1A`, color: alert.accent }}
      >
        <AlertTriangle size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">{alert.title}</span>
          <span className="text-[11px] font-semibold text-blue">{alert.fileNumber}</span>
        </div>
        <p className="truncate text-xs text-muted">{alert.detail}</p>
      </div>
    </button>
  );
}
