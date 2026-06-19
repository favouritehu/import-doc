import { cx } from '../lib/cx';

export interface TabDef {
  key: string;
  label: string;
  count?: number;
}

export function FilterTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cx(
              'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
              on ? 'bg-navy text-white' : 'bg-white text-medium border border-border hover:border-navy',
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cx(
                  'rounded-full px-1.5 text-xs',
                  on ? 'bg-white/20 text-white' : 'bg-page text-muted',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
