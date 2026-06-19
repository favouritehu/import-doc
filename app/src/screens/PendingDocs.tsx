import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/EmptyState';
import { requiredMissingDocs, responsibleOf } from '../lib/derive';
import { filesNeedingDocs } from '../lib/pending';
import { docLabel } from '../lib/docs';
import { supplierLabel } from '../lib/format';
import { useStore } from '../store/store';

export function PendingDocs() {
  const { files } = useStore();
  const nav = useNavigate();
  const groups = filesNeedingDocs(files);

  return (
    <>
      <TopBar title="Pending documents" subtitle={`${groups.length} file(s) awaiting docs`} />
      <Page>
        {groups.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing pending" sub="Every open file has its required documents." />
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((f) => {
              const missing = requiredMissingDocs(f);
              const [who, role] = responsibleOf(f);
              return (
                <button
                  key={f.id}
                  onClick={() => nav(`/files/${f.id}?tab=documents`)}
                  className="rounded-card border border-border bg-white p-4 text-left shadow-card transition hover:border-navy"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-display text-sm font-bold text-blue">{f.fileNumber}</span>
                      <span className="ml-2 text-sm font-semibold text-ink">{supplierLabel(f)}</span>
                    </div>
                    <span className="text-[11px] text-muted">
                      {who}
                      {role && ` · ${role}`}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {missing.map((d) => (
                      <span
                        key={d.type}
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          background: d.status === 'discrepant' ? '#FEE2E2' : '#FEF3C7',
                          color: d.status === 'discrepant' ? '#991B1B' : '#92400E',
                        }}
                      >
                        {docLabel(d.type)}
                        {d.status === 'discrepant' ? ' · discrepant' : ''}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
