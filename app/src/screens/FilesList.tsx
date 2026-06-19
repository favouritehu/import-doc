import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { SearchBar } from '../components/SearchBar';
import { FilterTabs, type TabDef } from '../components/FilterTabs';
import { ImportFileCard } from '../components/ImportFileCard';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Modal } from '../components/Overlay';
import { derivePriority, deriveStatus } from '../lib/derive';
import { supplierLabel } from '../lib/format';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore } from '../store/store';
import type { ImportFile } from '../types';

const matchTab = (f: ImportFile, tab: string): boolean => {
  const s = deriveStatus(f);
  switch (tab) {
    case 'all':
      return true;
    case 'docs':
      return s === 'draft' || s === 'documents_pending';
    case 'bank':
      return s === 'bank_work';
    case 'cha':
      return s === 'cha_work' || s === 'duty_paid';
    case 'done':
      return s === 'goods_received' || s === 'closed';
    case 'urgent':
      return derivePriority(f) === 'urgent';
    default:
      return true;
  }
};

export function FilesList() {
  const { role, files, deleteFile } = useStore();
  const nav = useNavigate();
  const showInr = RolePolicy.canSeeFinancials(role);
  const canDelete = RolePolicy.canDelete(role);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [delTarget, setDelTarget] = useState<ImportFile | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return files.filter((f) => {
      if (!matchTab(f, tab)) return false;
      if (!needle) return true;
      const hay = [
        f.fileNumber,
        supplierLabel(f),
        f.country,
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
    { key: 'bank', label: 'Bank', count: files.filter((f) => matchTab(f, 'bank')).length },
    { key: 'cha', label: 'CHA / Duty', count: files.filter((f) => matchTab(f, 'cha')).length },
    { key: 'urgent', label: 'Urgent', count: files.filter((f) => matchTab(f, 'urgent')).length },
    { key: 'done', label: 'Received', count: files.filter((f) => matchTab(f, 'done')).length },
  ];

  return (
    <>
      <TopBar title="Import files" subtitle={`${files.length} total`} />
      <Page>
        <div className="mb-3 flex flex-col gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Search file no, supplier, product…" />
          <FilterTabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No matching files" sub="Try a different filter or search term." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((f) => (
              <ImportFileCard
                key={f.id}
                file={f}
                showInr={showInr}
                onClick={() => nav(`/files/${f.id}`)}
                onDelete={canDelete ? () => setDelTarget(f) : undefined}
              />
            ))}
          </div>
        )}
      </Page>

      {delTarget && (
        <Modal
          title="Delete import file?"
          subtitle={`${delTarget.fileNumber} · ${supplierLabel(delTarget)}`}
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
            This permanently removes the import file and all its invoices, documents, payments and
            notes. This cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}
