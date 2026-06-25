import { useNavigate } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/EmptyState';
import { todayIso } from '../lib/dates';
import { todayItems, type TodayItem } from '../lib/today';
import { useStore } from '../store/store';

const DOT: Record<TodayItem['status'], string> = {
  red: '#DC2626',
  amber: '#F59E0B',
  green: '#16A34A',
};

export function Today() {
  const { files } = useStore();
  const nav = useNavigate();
  const items = todayItems(files, todayIso());
  const due = items.filter((i) => i.status !== 'green').length;

  return (
    <>
      <TopBar
        title="Today"
        subtitle={due > 0 ? `${due} need${due === 1 ? 's' : ''} attention` : 'Everything on track'}
      />
      <Page>
        {items.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="Nothing due" sub="No shipments, documents or payments need attention right now." />
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <button
                key={it.key}
                onClick={() => nav(`/files/${it.fileId}`)}
                className="flex items-center gap-3 rounded-card border border-border bg-white p-3 text-left shadow-card transition hover:border-navy"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: DOT[it.status] }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-blue">{it.fileNumber}</span>
                    <span className="truncate text-[12px] text-muted">{it.supplier}</span>
                  </div>
                  <div className="truncate text-[13px] text-ink">{it.reason}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
