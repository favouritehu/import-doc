import { useNavigate } from 'react-router-dom';
import { cx } from '../lib/cx';
import { useDesk, type Desk } from '../store/desk';

const SEGS: { d: Desk; label: string }[] = [
  { d: 'import', label: 'Import Desk' },
  { d: 'export', label: 'Export Desk' },
];

/** Segmented Import/Export desk switcher. Mirrors TopBar's RoleTabs styling
 *  (rounded-full pill, bg-navy active on light) — `variant="dark"` adapts the
 *  same active/idle tokens Sidebar already uses on its navy background. */
export function DeskSwitch({
  variant = 'light',
  className,
}: {
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const { desk, setDesk } = useDesk();
  const nav = useNavigate();
  const dark = variant === 'dark';

  const go = (d: Desk) => {
    setDesk(d);
    nav(d === 'export' ? '/exports' : '/');
  };

  return (
    <div className={cx('flex rounded-full p-0.5', dark ? 'bg-white/10' : 'bg-page', className)}>
      {SEGS.map((seg) => (
        <button
          key={seg.d}
          onClick={() => go(seg.d)}
          className={cx(
            'flex-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition',
            desk === seg.d
              ? dark
                ? 'bg-white/15 text-white'
                : 'bg-navy text-white'
              : dark
                ? 'text-white/65 hover:text-white'
                : 'text-muted hover:text-ink',
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}
