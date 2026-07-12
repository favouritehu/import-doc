import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock, Upload } from 'lucide-react';
import type { Currency, Doc, ExportFile, ExportPaymentType } from '../types';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { Badge, PriorityBadge } from '../components/Badge';
import { DocumentChecklist, type DocGroup } from '../components/DocumentChecklist';
import { ExportFilePreviewModal } from '../components/ExportFilePreviewModal';
import { NotesTimeline } from '../components/NotesTimeline';
import { Modal } from '../components/Overlay';
import { cx } from '../lib/cx';
import { derivePriorityExport, deriveExportStatus, exportFileAlerts, gateDocsExport, reqMissingExport, responsibleExportOf } from '../lib/deriveExport';
import { buyerLabel, exportValueInr, fxLine, inr, inrCompact, payInr } from '../lib/format';
import { EXPORT_COMMON_FILE_DOCS, EXPORT_CUSTOMS_DOCS, EXPORT_PAYMENT_LABELS, exportStatusMeta, payStatusMeta } from '../lib/docs';
import { RolePolicy } from '../lib/rolePolicy';
import { useExportStore, type ExportAddPaymentInput } from '../store/exportStore';

const inputCls = 'w-full rounded-card border border-border px-3 py-2.5 text-sm outline-none focus:border-navy';
const GATE_TYPES = new Set<string>(EXPORT_COMMON_FILE_DOCS);
const CUSTOMS_TYPES = new Set<string>(EXPORT_CUSTOMS_DOCS);

export function ExportFileDetail() {
  const { id } = useParams();
  const store = useExportStore();
  const file = store.getFile(Number(id));
  if (!file) {
    return (
      <>
        <TopBar title="Not found" back />
        <Page>
          <p className="text-sm text-muted">This export file does not exist.</p>
        </Page>
      </>
    );
  }
  return (
    <>
      <TopBar title={buyerLabel(file)} subtitle={file.fileNumber} back />
      <ExportFileDetailBody file={file} />
    </>
  );
}

function ExportFileDetailBody({ file }: { file: ExportFile }) {
  const nav = useNavigate();
  const store = useExportStore();
  const { role } = store;
  const [params, setParams] = useSearchParams();
  const [slide, setSlide] = useState<{ type: string; invoiceId?: string } | null>(null);
  const [addPay, setAddPay] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const canFin = RolePolicy.canSeeFinancials(role);
  const canHsn = RolePolicy.canSeeHsn(role);
  const canClose = RolePolicy.canMarkClosed(role);
  const canDelete = RolePolicy.canDelete(role);
  const status = deriveExportStatus(file);
  const [who, whoRole] = responsibleExportOf(file);
  const alerts = exportFileAlerts(file);
  const reqMissingCount = reqMissingExport(file);

  const tab = params.get('tab') ?? 'summary';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };
  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'documents', label: 'Documents' },
    ...(canFin ? [{ key: 'payments', label: 'Payments' }] : []),
    { key: 'notes', label: 'Notes' },
  ];

  // resolve the live doc behind the slide-over
  const slideDoc: Doc | null = (() => {
    if (!slide) return null;
    if (slide.invoiceId) {
      const inv = file.invoices.find((i) => i.id === slide.invoiceId);
      if (inv && inv.ci.type === slide.type) return inv.ci;
      if (inv && inv.pl.type === slide.type) return inv.pl;
      return null;
    }
    return file.docs.find((d) => d.type === slide.type) ?? null;
  })();

  const docGroups: DocGroup[] = [
    ...file.invoices.map((inv, i) => ({
      key: inv.id,
      title: `Invoice ${i + 1} · ${inv.buyer}`,
      subtitle: inv.invoiceNumber,
      invoiceId: inv.id,
      docs: [inv.ci, inv.pl],
    })),
    ...(() => {
      const gate = file.docs.filter((d) => GATE_TYPES.has(d.type));
      return gate.length ? [{ key: 'gate', title: 'Export documents', docs: gate }] : [];
    })(),
    ...(() => {
      const customs = file.docs.filter((d) => CUSTOMS_TYPES.has(d.type));
      return customs.length ? [{ key: 'customs', title: 'Customs & shipping', docs: customs }] : [];
    })(),
  ];

  return (
    <>
      <Page>
        {/* Header card */}
        <div className="mb-4 rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Badge tint={exportStatusMeta[status]} dot />
                <PriorityBadge priority={derivePriorityExport(file)} />
              </div>
              <div className="mt-2 text-sm text-muted">
                Responsible: <span className="font-semibold text-ink">{who}</span>
                {whoRole && ` · ${whoRole}`}
              </div>
            </div>
            <div className="text-right">
              {canFin ? (
                <>
                  <div className="text-[11px] text-faint">Invoice value</div>
                  <div className="font-display text-xl font-extrabold text-ink" title={inr(exportValueInr(file))}>
                    {inrCompact(exportValueInr(file))}
                  </div>
                </>
              ) : (
                <div className="inline-flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-muted">
                  <Lock size={12} /> Financials hidden
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setTab('documents')}>
              <Upload size={15} /> Documents
            </Button>
            {canClose && status !== 'closed' && (
              <Button
                variant="ghost"
                onClick={() => store.patchFile(file.id, { statusManual: true, status: 'closed' })}
              >
                Mark closed
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" className="text-red hover:border-red" onClick={() => setConfirmDel(true)}>
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="no-scrollbar mb-4 flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition',
                tab === t.key ? 'border-navy text-navy' : 'border-transparent text-muted hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'summary' && (
          <SummaryTab file={file} canFin={canFin} canHsn={canHsn} alerts={alerts} onGoDocs={() => setTab('documents')} />
        )}

        {tab === 'documents' && (
          <div className="flex flex-col gap-4">
            <h3 className="font-display text-sm font-bold text-ink">Documents</h3>
            <DocumentChecklist groups={docGroups} onRow={(d, invoiceId) => setSlide({ type: d.type, invoiceId })} />
            {reqMissingCount > 0 && (
              <p className="text-[11px] text-muted">
                {reqMissingCount} required {reqMissingCount === 1 ? 'document is' : 'documents are'} still missing —
                status stays “Docs Pending” until they’re added.
              </p>
            )}
          </div>
        )}

        {tab === 'payments' && canFin && (
          <PaymentsTab file={file} onAddPayment={() => setAddPay(true)} />
        )}

        {tab === 'notes' && <NotesTimeline notes={file.notes} onAdd={(m) => store.addNote(file.id, m)} />}
      </Page>

      {slideDoc && (
        <ExportFilePreviewModal file={file} doc={slideDoc} invoiceId={slide?.invoiceId} onClose={() => setSlide(null)} />
      )}
      {addPay && (
        <ExportAddPaymentModal onClose={() => setAddPay(false)} onAdd={(p) => store.addPayment(file.id, p)} />
      )}
      {confirmDel && (
        <Modal
          title="Delete export file?"
          subtitle={`${file.fileNumber} · ${buyerLabel(file)}`}
          onClose={() => setConfirmDel(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDel(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  store.deleteFile(file.id);
                  nav('/exports');
                }}
              >
                Delete file
              </Button>
            </div>
          }
        >
          <p className="text-sm text-medium">
            This permanently removes the export file and all its invoices, documents, payments and notes. This
            cannot be undone.
          </p>
        </Modal>
      )}
    </>
  );
}

function SummaryTab({
  file,
  canFin,
  canHsn,
  alerts,
  onGoDocs,
}: {
  file: ExportFile;
  canFin: boolean;
  canHsn: boolean;
  alerts: ReturnType<typeof exportFileAlerts>;
  onGoDocs: () => void;
}) {
  const facts: [string, string][] = [
    ['Mode', file.mode.toUpperCase()],
    ['Incoterm', file.incoterm],
    ['BL / AWB', file.blAwb || '—'],
    ['Port of loading', file.portLoading || '—'],
    ['Port of discharge', file.portDischarge],
    ['ETA', file.eta],
    ['Shipping line', file.shippingLine || '—'],
    ['Forwarder', file.forwarder || '—'],
    ['CHA', file.cha],
    ['Shipping bill no', file.shippingBillNo ?? '—'],
  ];
  const gatePending = gateDocsExport(file).filter((d) => d.status === 'missing' || d.status === 'discrepant');

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="rounded-card border border-border bg-white p-4 shadow-card">
          <h3 className="mb-3 font-display text-sm font-bold text-ink">Shipment</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {facts.map(([l, v]) => (
              <div key={l}>
                <div className="text-[11px] text-faint">{l}</div>
                <div className="text-sm font-semibold text-ink">{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-card border border-border bg-white p-4 shadow-card">
          <h3 className="mb-3 font-display text-sm font-bold text-ink">Invoices</h3>
          <div className="divide-y divide-border">
            {file.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{inv.buyer}</div>
                  <div className="text-[11px] text-muted">
                    {inv.invoiceNumber} · {inv.product}
                    {canHsn && inv.hsn ? ` · HSN ${inv.hsn}` : ''}
                  </div>
                </div>
                {canFin && (
                  <span className="shrink-0 text-sm font-bold text-ink">{inr(Math.round(inv.usd * inv.rate))}</span>
                )}
              </div>
            ))}
          </div>
          {canFin && (
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-bold">
              <span>Goods value</span>
              <span>{inr(exportValueInr(file))}</span>
            </div>
          )}
        </div>
      </div>

      <aside>
        <h3 className="mb-2 font-display text-sm font-bold text-ink">What's pending</h3>
        {alerts.length === 0 && gatePending.length === 0 ? (
          <div className="rounded-card border border-border bg-white p-3 text-sm text-muted shadow-card">
            All required documents are in.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="rounded-card border p-3 shadow-card"
                style={{ borderColor: `${a.accent}4D`, background: `${a.accent}0D` }}
              >
                <div className="text-sm font-bold text-ink">{a.title}</div>
                <div className="mt-1 text-[11px] text-muted">{a.detail}</div>
              </div>
            ))}
            {gatePending.length > 0 && (
              <button
                onClick={onGoDocs}
                className="w-full rounded-card border border-amber/30 bg-amber/5 p-3 text-left shadow-card"
              >
                <div className="text-sm font-bold text-ink">{gatePending.length} document(s) pending</div>
                <div className="mt-1 text-[11px] text-muted">
                  {gatePending.map((d) => d.label ?? d.type).join(', ')}
                </div>
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function PaymentGroup({ title, payments }: { title: string; payments: ExportFile['payments'] }) {
  const total = payments.reduce((s, p) => s + payInr(p), 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-sm font-bold text-ink">{title}</h4>
        <span className="text-sm font-bold text-ink">{inr(total)}</span>
      </div>
      {payments.length === 0 ? (
        <p className="rounded-card border border-dashed border-divider px-3 py-2 text-[11px] text-muted">None yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {payments.map((p, i) => (
            <div key={i} className="rounded-card border border-border bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{EXPORT_PAYMENT_LABELS[p.type]}</span>
                <Badge tint={payStatusMeta[p.status]} />
              </div>
              <div className="mt-1.5 font-display text-lg font-bold text-ink">{inr(payInr(p))}</div>
              <div className="text-xs text-muted">{fxLine(p)}</div>
              <div className="mt-2 text-[11px] text-muted">{p.paid ? `Paid ${p.paid}` : `Due ${p.due}`}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentsTab({ file, onAddPayment }: { file: ExportFile; onAddPayment: () => void }) {
  const receivables = file.payments.filter((p) => p.direction === 'receivable');
  const payables = file.payments.filter((p) => p.direction === 'payable');
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink">Payments</h3>
        <Button variant="ghost" onClick={onAddPayment}>
          Add payment
        </Button>
      </div>
      <PaymentGroup title="Receivables (buyer)" payments={receivables} />
      <PaymentGroup title="Payables (freight / CHA / bank)" payments={payables} />
    </div>
  );
}

const EXPORT_PAY_TYPES: ExportPaymentType[] = [
  'advance_received',
  'balance_received',
  'freight',
  'insurance',
  'cha_charges',
  'bank_charges',
  'other',
];
const CURRENCIES: Currency[] = ['USD', 'EUR', 'CNY', 'INR'];

function ExportAddPaymentModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: ExportAddPaymentInput) => void;
}) {
  const [type, setType] = useState<ExportPaymentType>('balance_received');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [due, setDue] = useState('');
  const valid = Number(amount) > 0;

  return (
    <Modal
      title="Add payment"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onAdd({ type, amount: Number(amount), currency, due });
              onClose();
            }}
          >
            Add payment
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as ExportPaymentType)} className={inputCls}>
            {EXPORT_PAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXPORT_PAYMENT_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-semibold text-muted">Amount</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Due date (optional)</span>
          <input value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} placeholder="e.g. 30 Jun 2026" />
        </label>
      </div>
    </Modal>
  );
}
