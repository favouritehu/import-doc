import { AlertTriangle, Download, FolderOpen, Landmark, Wallet } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { StatCard } from '../components/StatCard';
import { dutyTotal } from '../components/DutyBreakupCard';
import { derivePriority, deriveStatus } from '../lib/derive';
import { fileValueInr, inr, invoiceInr } from '../lib/format';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore } from '../store/store';

export function Reports() {
  const { role, files, showToast } = useStore();
  const canFin = RolePolicy.canSeeFinancials(role);

  const open = files.filter((f) => deriveStatus(f) !== 'closed');
  const openValue = open.reduce((s, f) => s + fileValueInr(f), 0);
  const dutyPaid = files
    .filter((f) => f.payments.some((p) => p.type === 'duty' && p.status === 'paid'))
    .reduce((s, f) => s + dutyTotal(f.duty), 0);
  const urgent = files.filter((f) => derivePriority(f) === 'urgent').length;

  // supplier-wise rollup (group invoice values by supplier)
  const bySupplier = new Map<string, { value: number; files: Set<number> }>();
  for (const f of files) {
    for (const inv of f.invoices) {
      const e = bySupplier.get(inv.supplier) ?? { value: 0, files: new Set<number>() };
      e.value += invoiceInr(inv);
      e.files.add(f.id);
      bySupplier.set(inv.supplier, e);
    }
  }
  const supplierRows = [...bySupplier.entries()].sort((a, b) => b[1].value - a[1].value);

  return (
    <>
      <TopBar title="Reports" subtitle="Financial year 2025–26" />
      <Page>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Open imports" value={open.length} icon={FolderOpen} tint="#E0E7FF" color="#3730A3" />
          {canFin ? (
            <StatCard label="Open goods value" value={inr(openValue)} icon={Wallet} tint="#DBEAFE" color="#1E40AF" />
          ) : (
            <StatCard label="Suppliers" value={bySupplier.size} icon={Wallet} tint="#DBEAFE" color="#1E40AF" />
          )}
          {canFin ? (
            <StatCard label="Duty paid (FY)" value={inr(dutyPaid)} icon={Landmark} tint="#CCFBF1" color="#0F766E" />
          ) : (
            <StatCard label="Countries" value={new Set(files.map((f) => f.country)).size} icon={Landmark} tint="#CCFBF1" color="#0F766E" />
          )}
          <StatCard label="Urgent" value={urgent} icon={AlertTriangle} tint="#FEE2E2" color="#991B1B" />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-ink">Supplier-wise</h2>
          <button
            onClick={() => showToast('CSV exported (stub)')}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-medium hover:border-navy"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>

        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                <th className="px-3 py-2.5">Supplier</th>
                <th className="px-3 py-2.5 text-right">Files</th>
                {canFin && <th className="px-3 py-2.5 text-right">Goods value</th>}
              </tr>
            </thead>
            <tbody>
              {supplierRows.map(([name, e]) => (
                <tr key={name} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-ink">{name}</td>
                  <td className="px-3 py-2.5 text-right text-medium">{e.files.size}</td>
                  {canFin && <td className="px-3 py-2.5 text-right font-semibold text-ink">{inr(e.value)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Page>
    </>
  );
}
