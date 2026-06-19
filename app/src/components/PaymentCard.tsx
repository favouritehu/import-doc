import type { Payment } from '../types';
import { PAYMENT_LABELS, payStatusMeta } from '../lib/docs';
import { fxLine, inr, payInr } from '../lib/format';
import { Badge } from './Badge';

export function PaymentCard({ payment, onMarkPaid }: { payment: Payment; onMarkPaid?: () => void }) {
  const open = payment.status !== 'paid';
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{PAYMENT_LABELS[payment.type]}</span>
        <Badge tint={payStatusMeta[payment.status]} />
      </div>
      <div className="mt-1.5 font-display text-lg font-bold text-ink">{inr(payInr(payment))}</div>
      <div className="text-xs text-muted">{fxLine(payment)}</div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>{payment.paid ? `Paid ${payment.paid}` : `Due ${payment.due}`}</span>
        {open && onMarkPaid && (
          <button onClick={onMarkPaid} className="font-semibold text-navy hover:underline">
            Mark paid
          </button>
        )}
      </div>
    </div>
  );
}
