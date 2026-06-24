import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileWarning, FolderOpen, FolderPlus, Plus, Ship, Wallet } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { StatCard } from '../components/StatCard';
import { AlertCard } from '../components/AlertCard';
import { ImportFileCard } from '../components/ImportFileCard';
import { StatusBadge } from '../components/Badge';
import { allAlerts, derivePriority, deriveStatus, responsibleOf } from '../lib/derive';
import { filesNeedingDocs, filesNeedingPayments } from '../lib/pending';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore } from '../store/store';

export function Dashboard() {
  const { role, files } = useStore();
  const nav = useNavigate();
  const showInr = RolePolicy.canSeeFinancials(role);

  const open = files.filter((f) => deriveStatus(f) !== 'closed');
  const alerts = allAlerts(files);
  const docsPending = filesNeedingDocs(files).length;
  const payPending = filesNeedingPayments(files).length;
  const urgent = files.filter((f) => derivePriority(f) === 'urgent').length;
  const chaActive = files.filter((f) => deriveStatus(f) === 'cha_work').length;

  const inFlight = open
    .filter((f) => !['goods_received'].includes(deriveStatus(f)))
    .sort((a, b) => (derivePriority(b) === 'urgent' ? 1 : 0) - (derivePriority(a) === 'urgent' ? 1 : 0));
  // Show every import on the dashboard (newest first), not just a slice.
  const allFiles = [...files].sort((a, b) => b.id - a.id);

  return (
    <>
      <TopBar title="Dashboard" subtitle={`${open.length} open imports · ${alerts.length} alerts`} />
      <Page>
        {files.length === 0 ? (
          <div className="grid place-items-center rounded-card border border-dashed border-divider bg-white px-6 py-16 text-center">
            <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-page text-muted">
              <FolderPlus size={22} />
            </div>
            <p className="font-display text-base font-bold text-ink">No imports yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Create your first import file to track documents, payments and customs in one place.
            </p>
            <button
              onClick={() => nav('/files/new')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-blue"
            >
              <Plus size={16} /> Create import file
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
            {alerts.length > 0 && (
              <section className="mb-5">
                <h2 className="mb-2 font-display text-sm font-bold text-ink">Needs attention</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {alerts.slice(0, 2).map((a, i) => (
                    <AlertCard key={i} alert={a} onClick={() => nav(`/files/${a.fileId}`)} />
                  ))}
                </div>
              </section>
            )}

            <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Open imports" value={open.length} icon={FolderOpen} tint="#E0E7FF" color="#3730A3" onClick={() => nav('/files')} />
              <StatCard label="Docs pending" value={docsPending} icon={FileWarning} tint="#FEF3C7" color="#92400E" onClick={() => nav('/pending-docs')} />
              {showInr ? (
                <StatCard label="Payments pending" value={payPending} icon={Wallet} tint="#DBEAFE" color="#1E40AF" onClick={() => nav('/pending-payments')} />
              ) : (
                <StatCard label="CHA in progress" value={chaActive} icon={Ship} tint="#DBEAFE" color="#1E40AF" onClick={() => nav('/cha-desk')} />
              )}
              <StatCard label="Urgent" value={urgent} icon={AlertTriangle} tint="#FEE2E2" color="#991B1B" onClick={() => nav('/alerts')} />
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-ink">All imports</h2>
                <span className="text-xs font-semibold text-muted">{allFiles.length} files</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {allFiles.map((f) => (
                  <ImportFileCard key={f.id} file={f} showInr={showInr} onClick={() => nav(`/files/${f.id}`)} />
                ))}
              </div>
            </section>
          </div>

          <aside>
            <h2 className="mb-2 font-display text-sm font-bold text-ink">Pending work</h2>
            <div className="flex flex-col gap-2">
              {inFlight.map((f) => {
                const [who, r] = responsibleOf(f);
                return (
                  <button
                    key={f.id}
                    onClick={() => nav(`/files/${f.id}`)}
                    className="flex items-center justify-between gap-2 rounded-card border border-border bg-white p-3 text-left shadow-card transition hover:border-navy"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-blue">{f.fileNumber}</div>
                      <div className="truncate text-[11px] text-muted">
                        {who}
                        {r && ` · ${r}`}
                      </div>
                    </div>
                    <StatusBadge status={deriveStatus(f)} />
                  </button>
                );
              })}
            </div>
          </aside>
          </div>
        )}
      </Page>
    </>
  );
}
