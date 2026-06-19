import { Fragment } from 'react';
import { Check } from 'lucide-react';
import type { FileStatus } from '../types';
import { cx } from '../lib/cx';
import { STATUS_ORDER, STEP_LABELS } from '../lib/docs';

export function ProgressStepper({ currentStatus }: { currentStatus: FileStatus }) {
  const idx = STATUS_ORDER.indexOf(currentStatus);
  return (
    <div className="no-scrollbar flex items-start gap-1 overflow-x-auto py-1">
      {STATUS_ORDER.map((s, i) => {
        const done = i < idx;
        const cur = i === idx;
        return (
          <Fragment key={s}>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <div
                className={cx(
                  'grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold',
                  cur ? 'bg-navy text-white' : done ? 'bg-green text-white' : 'bg-page text-faint',
                )}
              >
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span className={cx('text-[10px] font-semibold', cur ? 'text-ink' : 'text-faint')}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <div className={cx('mt-3.5 h-0.5 w-5 shrink-0 rounded-full', i < idx ? 'bg-green' : 'bg-divider')} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/** Thin progress bar (fraction of the 7-step ladder reached). */
export function ProgressBar({ status }: { status: FileStatus }) {
  const idx = STATUS_ORDER.indexOf(status);
  const pct = Math.round((idx / (STATUS_ORDER.length - 1)) * 100);
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-page">
      <div className="h-full rounded-full bg-navy transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
