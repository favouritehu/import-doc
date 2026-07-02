import type { Doc } from '../types';
import { DocumentRow } from './DocumentRow';

export interface DocGroup {
  key: string;
  title: string;
  subtitle?: string;
  invoiceId?: string;
  docs: Doc[];
}

export function DocumentChecklist({
  groups,
  onRow,
  onAddFile,
}: {
  groups: DocGroup[];
  onRow: (doc: Doc, invoiceId?: string) => void;
  onAddFile?: (invoiceId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <h4 className="font-display text-sm font-bold text-ink">{g.title}</h4>
              {g.subtitle && <span className="text-[11px] text-muted">{g.subtitle}</span>}
            </div>
            {onAddFile && g.invoiceId && (
              <button
                onClick={() => onAddFile(g.invoiceId!)}
                className="shrink-0 text-[11px] font-semibold text-navy hover:underline"
              >
                + Add file
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {g.docs.map((d) => (
              <DocumentRow key={`${g.key}-${d.type}`} doc={d} onClick={() => onRow(d, g.invoiceId)} />
            ))}
            {g.docs.length === 0 && g.invoiceId && (
              <p className="rounded-card border border-dashed border-divider px-3 py-2 text-[11px] text-muted">
                No files for this party yet — tap “+ Add file”.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
