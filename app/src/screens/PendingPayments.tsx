import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/Badge';
import { payStatusMeta, PAYMENT_LABELS } from '../lib/docs';
import { fxLine, inr, payInr, supplierLabel } from '../lib/format';
import { pendingPaymentRows } from '../lib/pending';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore } from '../store/store';

export function PendingPayments() {
  const { role, files, markPaid } = useStore();
  const nav = useNavigate();

  if (!RolePolicy.canSeeFinancials(role)) {
    return (
      <>
        <TopBar title="Pending payments" />
        <Page>
          <EmptyState icon={Lock} title="Restricted" sub="Payments are visible to Accountant and Owner only." />
        </Page>
      </>
    );
  }

  const rows = pendingPaymentRows(files);
  const total = rows.reduce((s, r) => s + payInr(r.payment), 0);

  return (
    <>
      <TopBar title="Pending payments" subtitle={`${rows.length} open · ${inr(total)} outflow`} />
      <Page>
        {rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="All settled" sub="No open payments across your files." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-3 py-2.5">File</th>
                  <th className="px-3 py-2.5">Supplier</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">FX</th>
                  <th className="px-3 py-2.5 text-right">INR</th>
                  <th className="px-3 py-2.5">Due</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-page">
                    <td className="px-3 py-2.5">
                      <button onClick={() => nav(`/files/${r.file.id}?tab=payments`)} className="font-semibold text-blue hover:underline">
                        {r.file.fileNumber}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-medium">{supplierLabel(r.file)}</td>
                    <td className="px-3 py-2.5 text-medium">{PAYMENT_LABELS[r.payment.type]}</td>
                    <td className="px-3 py-2.5 text-muted">{fxLine(r.payment)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{inr(payInr(r.payment))}</td>
                    <td className="px-3 py-2.5 text-muted">{r.payment.due}</td>
                    <td className="px-3 py-2.5">
                      <Badge tint={payStatusMeta[r.payment.status]} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => markPaid(r.file.id, r.idx)} className="font-semibold text-navy hover:underline">
                        Mark paid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-page font-bold">
                  <td className="px-3 py-2.5" colSpan={4}>
                    Total outflow
                  </td>
                  <td className="px-3 py-2.5 text-right">{inr(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Page>
    </>
  );
}
