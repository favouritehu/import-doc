import type { Doc } from '../types';
import { cx } from '../lib/cx';
import { DOC_META, docAbbr, docLabel, docStatusMeta } from '../lib/docs';
import { Badge } from './Badge';

export function DocumentRow({ doc, onClick }: { doc: Doc; onClick: () => void }) {
  const meta = DOC_META[doc.type];
  const flagged = doc.status === 'missing' || doc.status === 'discrepant';
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-card border px-3 py-2.5 text-left transition hover:border-navy',
        flagged && doc.required ? 'border-red/30 bg-red/5' : 'border-border bg-white',
      )}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold"
        style={{ background: meta?.tint, color: meta?.fg }}
      >
        {docAbbr(doc.type)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-ink">{docLabel(doc.type)}</span>
          {doc.required && doc.status === 'missing' && (
            <span className="rounded bg-red/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red">
              required
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-muted">
          {doc.by ? `${doc.by} · ${doc.at}` : 'Awaiting upload'}
        </div>
      </div>
      <Badge tint={docStatusMeta[doc.status]} />
    </button>
  );
}
