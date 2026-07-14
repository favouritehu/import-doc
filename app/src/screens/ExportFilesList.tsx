import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { SearchBar } from '../components/SearchBar';
import { FilterTabs, type TabDef } from '../components/FilterTabs';
import { ExportFileCard } from '../components/ExportFileCard';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Overlay';
import { derivePriorityExport, deriveExportStatus, allExportAlerts } from '../lib/deriveExport';
import { buyerLabel } from '../lib/format';
import { RolePolicy } from '../lib/rolePolicy';
import { useExportStore } from '../store/exportStore';
import type { ExportFile } from '../types';

const matchTab = (f: ExportFile, tab: string): boolean => {
  const s = deriveExportStatus(f);
  switch (tab) {
    case 'all':
      return true;
    case 'docs':
      return s === 'draft' || s === 'documents_pending';
    case 'shipping_bill':
      return s === 'cha_work';
    case 'customs':
      return s === 'customs_cleared' || s === 'shipped';
    case 'payment':
      return s === 'payment_realized' || s === 'closed';
    case 'urgent':
      return derivePriorityExport(f) === 'urgent';
    default:
      return true;
  }
};

export function ExportFilesList() {
  const { role, files, deleteFile } = useExportStore();
  const nav = useNavigate();
  const showInr = RolePolicy.canSeeFinancials(role);
  const canDelete = RolePolicy.canDelete(role);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [delTarget, setDelTarget] = useState<ExportFile | null>(null);

  const alertCount = useMemo(() => allExportAlerts(files).length, [files]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return files.filter((f) => {
      if (!matchTab(f, tab)) return false;
      if (!needle) return true;
      const hay = [
        f.fileNumber,
        buyerLabel(f),
        f.destination,
        ...f.invoices.flatMap((i) => [i.product, i.invoiceNumber]),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [files, q, tab]);

  const tabs: TabDef[] = [
    { key: 'all', label: 'All', count: files.length },
    { key: 'docs', label: 'Docs', count: files.filter((f) => matchTab(f, 'docs')).length },
    { key: 'shipping_bill', label: 'Shipping Bill', count: files.filter((f) => matchTab(f, 'shipping_bill')).length },
    { key: 'customs', label: 'Customs', count: files.filter((f) => matchTab(f, 'customs')).length },
    { key: 'payment', label: 'Payment', count: files.filter((f) => matchTab(f, 'payment')).length },
    { key: 'urgent', label: 'Urgent', count: files.filter((f) => matchTab(f, 'urgent')).length },
  ];

  return (
    <>
      <TopBar
        title="Export Desk"
        subtitle={`${files.length} total${alertCount > 0 ? ` · ${alertCount} alert${alertCount > 1 ? 's' : ''}` : ''}`}
      />
      <Page>
        <div className="mb-3 flex flex-col gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Search file no, buyer, product…" />
          <FilterTabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No matching files" sub="Try a different filter or search term." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((f) => (
              <ExportFileCard
                key={f.id}
                file={f}
                showInr={showInr}
                onClick={() => nav(`/exports/${f.id}`)}
                onDelete={canDelete ? () => setDelTarget(f) : undefined}
              />
            ))}
          </div>
        )}
      </Page>

      {delTarget && (
        <Modal
          title="Delete export file?"
          subtitle={`${delTarget.fileNumber} · ${buyerLabel(delTarget)}`}
          onClose={() => setDelTarget(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDelTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteFile(delTarget.id);
                  setDelTarget(null);
                }}
              >
                Delete file
              </Button>
            </div>
          }
        >
          <p className="text-sm text-medium">
            This permanently removes the export file and all its invoices, documents, payments and
            notes. This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
