// The workspace: party rail (grouped by lifecycle phase) + detail pane. The rail
// reads top-to-bottom as the morning sweep: Needs action → Arrived, clearing →
// In transit → Done. Keyboard: ↑↓ move selection, / focuses search.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FolderPlus, Inbox, Plus, Search, Ship, ClipboardCheck } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { useIsMobile } from '../lib/useIsMobile';
import { todayIso } from '../lib/dates';
import { railItems, type RailItem, type RailStatus } from '../lib/rail';
import { useStore } from '../store/store';
import { FileDetailBody } from './FileDetail';

const DOT: Record<RailStatus, string> = {
  red: '#DC2626',
  amber: '#F59E0B',
  green: '#16A34A',
  none: '#CBD5E1',
};

// Arrival line colour — red = urgent sign, green = safe zone.
const LINE: Record<RailStatus, string> = {
  red: '#DC2626',
  amber: '#B45309',
  green: '#16A34A',
  none: '#64748B',
};

const PHASES: { key: RailItem['phase']; title: string }[] = [
  { key: 'action', title: 'Needs action' },
  { key: 'clearing', title: 'Arrived · clearing' },
  { key: 'transit', title: 'In transit' },
  { key: 'done', title: 'Done' },
];

interface Group {
  key: string;
  title: string;
  items: RailItem[];
}

function groupItems(items: RailItem[]): Group[] {
  return PHASES.map((p) => ({ key: p.key, title: p.title, items: items.filter((i) => i.phase === p.key) })).filter(
    (g) => g.items.length > 0,
  );
}

/** The party rail: search + All/Needs-attention filter + phase-grouped rows. */
function PartiesRail({
  groups,
  total,
  q,
  onQ,
  filter,
  onFilter,
  selectedId,
  onSelect,
}: {
  groups: Group[];
  total: number;
  q: string;
  onQ: (v: string) => void;
  filter: 'all' | 'attention';
  onFilter: (f: 'all' | 'attention') => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const empty = groups.length === 0;
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-white px-3 pb-2 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-ink">Imports</h2>
          <span className="text-xs font-semibold text-muted">{total}</span>
        </div>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            id="rail-search"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Search party or file no  ( / )"
            className="w-full rounded-full border border-border bg-page py-1.5 pl-8 pr-3 text-xs outline-none focus:border-navy"
          />
        </div>
        <div className="flex rounded-full bg-page p-0.5 text-xs font-semibold">
          {(['all', 'attention'] as const).map((k) => (
            <button
              key={k}
              onClick={() => onFilter(k)}
              className={`flex-1 rounded-full px-2 py-1 transition ${
                filter === k ? 'bg-white text-navy shadow-card' : 'text-muted hover:text-ink'
              }`}
            >
              {k === 'all' ? 'All' : 'Needs attention'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {empty ? (
          <div className="grid place-items-center gap-1 px-4 py-12 text-center text-muted">
            <Inbox size={22} className="text-faint" />
            <p className="text-xs">No imports match.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 px-3 pb-1 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{g.title}</span>
                <span className="text-[10px] font-semibold text-faint">{g.items.length}</span>
              </div>
              {g.items.map((it) => {
                const selected = it.fileId === selectedId;
                return (
                  <button
                    key={it.fileId}
                    onClick={() => onSelect(it.fileId)}
                    className={`relative mb-[3px] flex w-full gap-2.5 rounded-[11px] px-3 py-2.5 text-left transition ${
                      selected ? 'bg-page' : 'hover:bg-page'
                    }`}
                  >
                    {selected && (
                      <span
                        className="absolute bottom-3.5 left-0 top-3.5 w-[3px] rounded-full"
                        style={{ backgroundColor: DOT[it.status] === '#CBD5E1' ? '#0E1726' : DOT[it.status] }}
                        aria-hidden
                      />
                    )}
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: DOT[it.status] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{it.party}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-[11px]">
                        <span className="font-mono text-muted">{it.fileNumber}</span>
                        <span className="text-divider">·</span>
                        <span className="truncate font-semibold" style={{ color: LINE[it.status] }}>
                          {it.line}
                        </span>
                      </span>
                      {it.track && (
                        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-medium">
                          <Ship size={11} className="shrink-0 text-faint" />
                          <span className="truncate">{it.track}</span>
                        </span>
                      )}
                      {it.cha && (
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-medium">
                          <ClipboardCheck size={11} className="shrink-0 text-faint" />
                          <span className="truncate">{it.cha}</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Skeleton rail rows while the store hydrates — no spinner-in-the-middle. */
function RailSkeleton() {
  return (
    <div className="px-3 pt-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="anim-pulse mb-2 rounded-[11px] bg-white p-3">
          <div className="h-3 w-2/3 rounded bg-page" />
          <div className="mt-2 h-2.5 w-1/2 rounded bg-page" />
          <div className="mt-2 h-2.5 w-3/4 rounded bg-page" />
        </div>
      ))}
    </div>
  );
}

export function Workspace() {
  const { files, ready } = useStore();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'attention'>('all');

  const items = useMemo(() => railItems(files, todayIso()), [files]);
  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      items.filter((it) => {
        if (filter === 'attention' && it.status !== 'red' && it.status !== 'amber') return false;
        if (!needle) return true;
        return it.party.toLowerCase().includes(needle) || it.fileNumber.toLowerCase().includes(needle);
      }),
    [items, filter, needle],
  );
  const groups = useMemo(() => groupItems(shown), [shown]);
  const flat = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.fileId)), [groups]);

  const selId = params.get('file') ? Number(params.get('file')) : shown[0]?.fileId;
  const selFile = files.find((f) => f.id === selId);
  const select = (id: number) => {
    const next = new URLSearchParams(params);
    next.set('file', String(id));
    next.delete('tab'); // open a freshly-picked import on its Summary
    setParams(next, { replace: true });
  };

  // Keyboard: ↑↓ walk the rail (desktop), / jumps to search.
  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        document.getElementById('rail-search')?.focus();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !typing && flat.length) {
        e.preventDefault();
        const cur = flat.indexOf(selId ?? -1);
        const next = e.key === 'ArrowDown' ? Math.min(cur + 1, flat.length - 1) : Math.max(cur - 1, 0);
        select(flat[next < 0 ? 0 : next]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, flat, selId, params]);

  if (!ready) {
    return (
      <>
        <TopBar title="Imports" />
        {isMobile ? (
          <RailSkeleton />
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="w-80 shrink-0 border-r border-border bg-white">
              <RailSkeleton />
            </aside>
            <div className="flex-1" />
          </div>
        )}
      </>
    );
  }

  if (files.length === 0) {
    return (
      <>
        <TopBar title="Imports" />
        <Page>
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
        </Page>
      </>
    );
  }

  // Mobile: rail list only; tapping opens the full-screen file route.
  if (isMobile) {
    return (
      <>
        <TopBar title="Imports" subtitle={`${files.length} shipments`} />
        <div className="h-[calc(100vh-8rem)]">
          <PartiesRail
            groups={groups}
            total={items.length}
            q={q}
            onQ={setQ}
            filter={filter}
            onFilter={setFilter}
            selectedId={null}
            onSelect={(id) => nav(`/files/${id}`)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Imports" subtitle={`${files.length} shipments`} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-hidden border-r border-border bg-white">
          <PartiesRail
            groups={groups}
            total={items.length}
            q={q}
            onQ={setQ}
            filter={filter}
            onFilter={setFilter}
            selectedId={selFile?.id ?? null}
            onSelect={select}
          />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {selFile ? (
            <FileDetailBody
              file={selFile}
              // Stay in the workspace on delete: clear the selection param so the
              // default (most-urgent) file takes over — not a jump to /files with a
              // stale ?file=<deleted> left in history.
              onDeleted={() => {
                const next = new URLSearchParams(params);
                next.delete('file');
                next.delete('tab');
                setParams(next, { replace: true });
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-muted">
              <div className="text-center">
                <Inbox size={26} className="mx-auto mb-2 text-faint" />
                <p className="text-sm font-semibold">Select an import on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
