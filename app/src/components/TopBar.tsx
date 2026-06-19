import { useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, Plus } from 'lucide-react';
import type { Role } from '../types';
import { cx } from '../lib/cx';
import { ROLE_SHORT } from '../lib/rolePolicy';
import { navBadges } from '../lib/pending';
import { useStore } from '../store/store';

const ROLES: Role[] = ['admin', 'import_manager', 'accountant'];

function RoleTabs({ className }: { className?: string }) {
  const { role, setRole } = useStore();
  return (
    <div className={cx('flex rounded-full bg-page p-0.5', className)}>
      {ROLES.map((r) => (
        <button
          key={r}
          onClick={() => setRole(r)}
          className={cx(
            'rounded-full px-2.5 py-1 text-xs font-semibold transition',
            role === r ? 'bg-navy text-white' : 'text-muted hover:text-ink',
          )}
        >
          {ROLE_SHORT[r]}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
}) {
  const { files } = useStore();
  const badges = navBadges(files);
  const nav = useNavigate();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-content items-center gap-3 px-4 py-3 md:px-6">
        {back && (
          <button
            onClick={() => nav(-1)}
            aria-label="Back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-medium hover:border-navy"
          >
            <ChevronLeft size={19} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold text-ink">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>

        <RoleTabs className="hidden sm:flex" />

        <button
          onClick={() => nav('/alerts')}
          aria-label="Alerts"
          className="relative grid h-9 w-9 place-items-center rounded-full border border-border text-medium hover:border-navy"
        >
          <Bell size={18} />
          {badges.alerts > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
              {badges.alerts}
            </span>
          )}
        </button>

        <button
          onClick={() => nav('/files/new')}
          className="hidden items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue md:inline-flex"
        >
          <Plus size={16} /> New file
        </button>
      </div>
      <RoleTabs className="flex px-4 pb-2 sm:hidden" />
    </header>
  );
}
