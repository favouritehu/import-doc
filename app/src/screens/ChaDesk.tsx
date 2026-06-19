import { useNavigate } from 'react-router-dom';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/EmptyState';
import { Ship } from 'lucide-react';
import { CHA_STEPS } from '../lib/docs';
import { supplierLabel } from '../lib/format';
import { deriveStatus } from '../lib/derive';
import { useStore } from '../store/store';
import type { ImportFile } from '../types';

function currentStep(f: ImportFile): { label: string; done: number } {
  const done = CHA_STEPS.filter((s) => f.chaOv[s.key]?.[0] === 'done').length;
  const next = CHA_STEPS.find((s) => f.chaOv[s.key]?.[0] !== 'done');
  return { label: next ? next.label : 'Complete', done };
}

export function ChaDesk() {
  const { files } = useStore();
  const nav = useNavigate();
  const active = files.filter((f) => !['draft', 'closed'].includes(deriveStatus(f)));

  return (
    <>
      <TopBar title="CHA desk" subtitle={`${active.length} file(s) in clearance`} />
      <Page>
        {active.length === 0 ? (
          <EmptyState icon={Ship} title="No files in clearance" sub="Files appear here once documents are in." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-3 py-2.5">File</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">CHA</th>
                  <th className="px-3 py-2.5">Current step</th>
                  <th className="px-3 py-2.5">Progress</th>
                </tr>
              </thead>
              <tbody>
                {active.map((f) => {
                  const { label, done } = currentStep(f);
                  const pct = Math.round((done / CHA_STEPS.length) * 100);
                  return (
                    <tr
                      key={f.id}
                      onClick={() => nav(`/files/${f.id}?tab=cha`)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-page"
                    >
                      <td className="px-3 py-2.5 font-semibold text-blue">{f.fileNumber}</td>
                      <td className="px-3 py-2.5 text-medium">{supplierLabel(f)}</td>
                      <td className="px-3 py-2.5 text-medium">{f.cha}</td>
                      <td className="px-3 py-2.5 text-medium">{label}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-page">
                            <div className="h-full rounded-full bg-navy" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted">
                            {done}/{CHA_STEPS.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
