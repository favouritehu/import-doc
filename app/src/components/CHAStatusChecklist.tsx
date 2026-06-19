import type { ChaOv } from '../types';
import { cx } from '../lib/cx';
import { CHA_STEPS, chaStepMeta } from '../lib/docs';
import { Badge } from './Badge';

export function CHAStatusChecklist({
  chaOv,
  editable,
  onToggle,
}: {
  chaOv: ChaOv;
  editable: boolean;
  onToggle?: (stepKey: string) => void;
}) {
  return (
    <ol className="flex flex-col gap-2">
      {CHA_STEPS.map((s, i) => {
        const [st, date] = chaOv[s.key] ?? ['pending', ''];
        return (
          <li key={s.key}>
            <button
              disabled={!editable}
              onClick={() => onToggle?.(s.key)}
              className={cx(
                'flex w-full items-center gap-3 rounded-card border border-border bg-white px-3 py-2.5 text-left',
                editable && 'transition hover:border-navy',
              )}
            >
              <span
                className={cx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                  st === 'done' ? 'bg-green text-white' : st === 'na' ? 'bg-page text-faint' : 'bg-page text-muted',
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{s.label}</div>
                {date && <div className="text-[11px] text-muted">{date}</div>}
              </div>
              <Badge tint={chaStepMeta[st]} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
