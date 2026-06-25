import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, CalendarCheck, FolderOpen, LayoutDashboard, MoreHorizontal, Plus } from 'lucide-react';
import { cx } from '../lib/cx';
import { navBadges } from '../lib/pending';
import { useStore } from '../store/store';

export function MobileBottomNav() {
  const { files } = useStore();
  const badges = navBadges(files);
  const nav = useNavigate();
  const { pathname } = useLocation();

  const item = (path: string, label: string, Icon: typeof Bell, badge?: number) => {
    const active = path === '/' ? pathname === '/' : pathname.startsWith(path);
    return (
      <button
        onClick={() => nav(path)}
        className={cx('relative flex flex-1 flex-col items-center gap-1 py-1', active ? 'text-navy' : 'text-faint')}
      >
        <Icon size={21} />
        <span className="text-[10px] font-semibold">{label}</span>
        {badge ? (
          <span className="absolute right-3 top-0 rounded-full bg-red px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-border bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 md:hidden">
      {item('/today', 'Today', CalendarCheck, badges.today)}
      {item('/', 'Home', LayoutDashboard)}
      {item('/files', 'Files', FolderOpen)}
      <div className="flex flex-1 justify-center">
        <button
          onClick={() => nav('/files/new')}
          aria-label="Create import file"
          className="-mt-6 grid h-14 w-14 place-items-center rounded-full bg-navy text-white shadow-modal"
        >
          <Plus size={26} />
        </button>
      </div>
      {item('/alerts', 'Alerts', Bell, badges.alerts)}
      {item('/settings', 'More', MoreHorizontal)}
    </nav>
  );
}
