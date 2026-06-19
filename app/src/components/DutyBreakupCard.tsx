import type { Duty } from '../types';
import { inr } from '../lib/format';

export function dutyTotal(d: Duty): number {
  return d.bcd + d.sws + d.igst + d.cess + d.anti_dumping + d.other;
}

export function DutyBreakupCard({ duty, boeNumber }: { duty: Duty; boeNumber: string | null }) {
  const rows: [string, number][] = [
    ['Basic Customs Duty (BCD)', duty.bcd],
    ['Social Welfare Surcharge', duty.sws],
    ['IGST', duty.igst],
    ['Compensation Cess', duty.cess],
    ['Anti-dumping Duty', duty.anti_dumping],
    ['Other', duty.other],
  ];
  const total = dutyTotal(duty);

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-sm font-bold text-ink">Duty breakup</h4>
        <span className="text-[11px] text-muted">{boeNumber ? `BOE ${boeNumber}` : 'BOE pending'}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {rows.map(([label, val]) => (
          <div key={label}>
            <div className="text-[11px] text-faint">{label}</div>
            <div className="text-sm font-semibold text-ink">{val ? inr(val) : '—'}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold text-medium">Total duty</span>
        <span className="font-display text-lg font-bold text-ink">{inr(total)}</span>
      </div>
      {duty.igst > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          IGST {inr(duty.igst)} is creditable as ITC (reconcile against GSTR-2B).
        </p>
      )}
    </div>
  );
}
