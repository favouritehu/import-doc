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
}: {
  groups: DocGroup[];
  onRow: (doc: Doc, invoiceId?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="font-display text-sm font-bold text-ink">{g.title}</h4>
            {g.subtitle && <span className="text-[11px] text-muted">{g.subtitle}</span>}
          </div>
          <div className="flex flex-col gap-2">
            {g.docs.map((d) => (
              <DocumentRow key={`${g.key}-${d.type}`} doc={d} onClick={() => onRow(d, g.invoiceId)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
