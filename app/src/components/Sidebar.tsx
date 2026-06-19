import { NavLink, useNavigate } from 'react-router-dom';
import { cx } from '../lib/cx';
import { navForRole } from '../lib/nav';
import { navBadges } from '../lib/pending';
import { magicPath } from '../lib/links';
import { ROLE_LABEL } from '../lib/rolePolicy';
import { USERS } from '../data/seed';
import { useStore } from '../store/store';
import { NAV_ICONS } from './navIcons';

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-xl bg-amber font-display font-extrabold text-navy"
      style={{ height: size, width: size, fontSize: size * 0.36 }}
    >
      ID
    </div>
  );
}

export function Sidebar() {
  const { role, files } = useStore();
  const badges = navBadges(files);
  const items = navForRole(role);
  const me = USERS.find((u) => u.role === role);
  const nav = useNavigate();

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-navy px-3 py-4 text-white md:flex">
      <div className="flex items-center gap-2.5 px-2 pb-5">
        <Logo />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-bold">Import Desk</div>
          <div className="text-[11px] text-white/55">Favourite Fab</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {items.map((it) => {
          const Icon = NAV_ICONS[it.key];
          const badge = it.badge ? badges[it.badge] : 0;
          return (
            <NavLink
              key={it.key}
              to={it.path}
              end={it.path === '/'}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                  isActive ? 'bg-white/15 text-white' : 'text-white/65 hover:bg-white/10 hover:text-white',
                )
              }
            >
              <Icon size={18} />
              <span className="flex-1">{it.label}</span>
              {badge > 0 && (
                <span className="rounded-full bg-red px-1.5 text-[11px] font-bold text-white">{badge}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-2 border-t border-white/10 pt-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-xs font-bold">
            {me?.initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{me?.name}</div>
            <div className="text-[11px] text-white/55">{ROLE_LABEL[role]}</div>
          </div>
        </div>
        {files[0] && (
          <button
            onClick={() => nav(magicPath(files[0].fileNumber, 'cha'))}
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[12px] font-semibold text-white/55 transition hover:text-white"
          >
            Preview CHA link →
          </button>
        )}
      </div>
    </aside>
  );
}
