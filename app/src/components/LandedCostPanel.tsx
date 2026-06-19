import type { ImportFile } from '../types';
import { fileValueInr, inr, payInr } from '../lib/format';
import { dutyTotal } from './DutyBreakupCard';

/**
 * Honesty fix: never invents a landed cost. Goods value sums the invoices;
 * duty / freight / CHA show muted "Pending" until their data exists. The total
 * only claims "Estimated landed cost" once duty is present.
 */
export function LandedCostPanel({ file }: { file: ImportFile }) {
  const goods = fileValueInr(file);
  const duty = dutyTotal(file.duty);
  const dutyPresent = duty > 0;

  const freightRelevant = file.incoterm !== 'CIF' && file.incoterm !== 'CFR';
  const freightPay = freightRelevant ? file.payments.find((p) => p.type === 'freight') : undefined;
  const freight = freightPay ? payInr(freightPay) : 0;

  const chaPay = file.payments.find((p) => p.type === 'cha_charges');
  const cha = chaPay ? payInr(chaPay) : 0;

  const total = goods + duty + freight + cha;

  const row = (label: string, present: boolean, value: number, note?: string) => (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-medium">{label}</span>
      {present ? (
        <span className="text-sm font-semibold text-ink">{inr(value)}</span>
      ) : (
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">{note ?? 'Pending'}</span>
      )}
    </div>
  );

  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-sm font-bold text-ink">Landed cost</h4>
        <span className="rounded-full bg-page px-2 py-0.5 text-[10px] font-semibold text-muted">
          Live · Phase 2 rollup
        </span>
      </div>
      <div className="divide-y divide-border">
        {row(`Goods value (${file.invoices.length} invoice${file.invoices.length > 1 ? 's' : ''})`, true, goods)}
        {row('Customs duty', dutyPresent, duty)}
        {row('Freight', !!freightPay, freight, freightRelevant ? 'Pending' : `In goods (${file.incoterm})`)}
        {row('CHA charges', !!chaPay, cha)}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        {dutyPresent ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-medium">Estimated landed cost</span>
            <span className="font-display text-xl font-extrabold text-ink">{inr(total)}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-medium">Goods value so far</span>
              <span className="font-display text-xl font-extrabold text-ink">{inr(goods)}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">Add duty &amp; freight to complete the estimate.</p>
          </>
        )}
      </div>
    </div>
  );
}
