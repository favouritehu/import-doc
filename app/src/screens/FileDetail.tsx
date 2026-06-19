import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Link2, Lock, Trash2, Upload } from 'lucide-react';
import type { Currency, PaymentType } from '../types';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { PriorityBadge, StatusBadge } from '../components/Badge';
import { ProgressStepper } from '../components/ProgressStepper';
import { DocumentChecklist, type DocGroup } from '../components/DocumentChecklist';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { PaymentCard } from '../components/PaymentCard';
import { DutyBreakupCard } from '../components/DutyBreakupCard';
import { CHAStatusChecklist } from '../components/CHAStatusChecklist';
import { NotesTimeline } from '../components/NotesTimeline';
import { LandedCostPanel } from '../components/LandedCostPanel';
import { MagicLinkPanel } from '../components/MagicLinkPanel';
import { Modal } from '../components/Overlay';
import { cx } from '../lib/cx';
import { derivePriority, deriveStatus, relevantPayments, requiredMissingDocs, responsibleOf } from '../lib/derive';
import { fileValueInr, inr, invoiceInr, supplierLabel } from '../lib/format';
import { PAYMENT_LABELS } from '../lib/docs';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore } from '../store/store';

export function FileDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const store = useStore();
  const { role } = store;
  const file = store.getFile(Number(id));
  const [params, setParams] = useSearchParams();
  const [slide, setSlide] = useState<{ type: string; invoiceId?: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [addPay, setAddPay] = useState(false);
  const [addInv, setAddInv] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!file) {
    return (
      <>
        <TopBar title="Not found" back />
        <Page>
          <p className="text-sm text-muted">This import file does not exist.</p>
        </Page>
      </>
    );
  }

  const canFin = RolePolicy.canSeeFinancials(role);
  const canHsn = RolePolicy.canSeeHsn(role);
  const canClose = RolePolicy.canMarkClosed(role);
  const canDelete = RolePolicy.canDelete(role);
  const status = deriveStatus(file);
  const [who, whoRole] = responsibleOf(file);

  const tab = params.get('tab') ?? 'summary';
  const setTab = (t: string) => setParams({ tab: t }, { replace: true });
  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'documents', label: 'Documents' },
    ...(canFin ? [{ key: 'payments', label: 'Payments' }] : []),
    { key: 'cha', label: 'CHA Status' },
    { key: 'notes', label: 'Notes' },
  ];

  // resolve the live doc behind the slide-over
  const slideDoc = (() => {
    if (!slide) return null;
    if (slide.invoiceId) {
      const inv = file.invoices.find((i) => i.id === slide.invoiceId);
      if (!inv) return null;
      return inv.ci.type === slide.type ? inv.ci : inv.pl;
    }
    return file.docs.find((d) => d.type === slide.type) ?? null;
  })();

  const docGroups: DocGroup[] = [
    ...file.invoices.map((inv, i) => ({
      key: inv.id,
      title: `Invoice ${i + 1} · ${inv.supplier}`,
      subtitle: inv.invoiceNumber,
      invoiceId: inv.id,
      docs: [inv.ci, inv.pl],
    })),
    { key: 'shared', title: 'Shared documents', subtitle: 'One clearance', docs: file.docs },
  ];

  return (
    <>
      <TopBar title={file.fileNumber} subtitle={supplierLabel(file)} back />
      <Page>
        {/* Header card */}
        <div className="mb-4 rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <StatusBadge status={status} />
                <PriorityBadge priority={derivePriority(file)} />
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
                  <div className="font-display text-xl font-extrabold text-ink">{inr(fileValueInr(file))}</div>
                </>
              ) : (
                <div className="inline-flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-muted">
                  <Lock size={12} /> Financials hidden
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <ProgressStepper currentStatus={status} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setLinkOpen(true)}>
              <Link2 size={15} /> Generate link
            </Button>
            <Button variant="ghost" onClick={() => setTab('documents')}>
              <Upload size={15} /> Documents
            </Button>
            {canClose && status !== 'closed' && (
              <Button variant="ghost" onClick={() => store.markClosed(file.id)}>
                Mark closed
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" className="text-red hover:border-red" onClick={() => setConfirmDel(true)}>
                <Trash2 size={15} /> Delete
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
          <SummaryTab
            file={file}
            canFin={canFin}
            canHsn={canHsn}
            canDelete={canDelete}
            onAddInvoice={() => setAddInv(true)}
            onRemoveInvoice={(invId) => store.removeInvoice(file.id, invId)}
            onGoDocs={() => setTab('documents')}
          />
        )}

        {tab === 'documents' && (
          <DocumentChecklist groups={docGroups} onRow={(d, invoiceId) => setSlide({ type: d.type, invoiceId })} />
        )}

        {tab === 'payments' && canFin && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-ink">Payments</h3>
              <Button variant="ghost" onClick={() => setAddPay(true)}>
                Add payment
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {relevantPayments(file).map((p) => {
                const idx = file.payments.indexOf(p);
                return <PaymentCard key={idx} payment={p} onMarkPaid={() => store.markPaid(file.id, idx)} />;
              })}
            </div>
            <DutyBreakupCard duty={file.duty} boeNumber={file.boeNumber} />
          </div>
        )}

        {tab === 'cha' && (
          <CHAStatusChecklist chaOv={file.chaOv} editable onToggle={(k) => store.toggleChaStep(file.id, k)} />
        )}

        {tab === 'notes' && <NotesTimeline notes={file.notes} onAdd={(m) => store.addNote(file.id, m)} />}
      </Page>

      {slideDoc && <FilePreviewModal file={file} doc={slideDoc} invoiceId={slide?.invoiceId} onClose={() => setSlide(null)} />}
      {linkOpen && <MagicLinkPanel file={file} onClose={() => setLinkOpen(false)} />}
      {addPay && <AddPaymentModal onClose={() => setAddPay(false)} onAdd={(p) => store.addPayment(file.id, p)} />}
      {addInv && <AddInvoiceModal onClose={() => setAddInv(false)} onAdd={(d) => store.addInvoice(file.id, d)} />}
      {confirmDel && (
        <Modal
          title="Delete import file?"
          subtitle={`${file.fileNumber} · ${supplierLabel(file)}`}
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
                  nav('/files');
                }}
              >
                Delete file
              </Button>
            </div>
          }
        >
          <p className="text-sm text-medium">
            This permanently removes the import file and all its invoices, documents, payments and notes.
            This cannot be undone.
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
  canDelete,
  onAddInvoice,
  onRemoveInvoice,
  onGoDocs,
}: {
  file: ReturnType<typeof useStore>['files'][number];
  canFin: boolean;
  canHsn: boolean;
  canDelete: boolean;
  onAddInvoice: () => void;
  onRemoveInvoice: (invId: string) => void;
  onGoDocs: () => void;
}) {
  const facts: [string, string][] = [
    ['Mode', file.mode.toUpperCase()],
    ['Incoterm', file.incoterm],
    ['BL / AWB', file.blAwb || '—'],
    ['Port of loading', file.portLoading || '—'],
    ['Port of arrival', file.portArrival],
    ['ETA', file.eta],
    ['Shipping line', file.shippingLine || '—'],
    ['CHA', file.cha],
  ];
  const missing = requiredMissingDocs(file);

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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">Invoices</h3>
            <button onClick={onAddInvoice} className="text-xs font-semibold text-navy hover:underline">
              + Add invoice
            </button>
          </div>
          <div className="divide-y divide-border">
            {file.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{inv.supplier}</div>
                  <div className="text-[11px] text-muted">
                    {inv.invoiceNumber} · {inv.product}
                    {canHsn && inv.hsn ? ` · HSN ${inv.hsn}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canFin && <span className="text-sm font-bold text-ink">{inr(invoiceInr(inv))}</span>}
                  {canDelete && file.invoices.length > 1 && (
                    <button
                      onClick={() => onRemoveInvoice(inv.id)}
                      aria-label="Remove invoice"
                      className="text-faint hover:text-red"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canFin && (
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-bold">
              <span>Goods value</span>
              <span>{inr(fileValueInr(file))}</span>
            </div>
          )}
        </div>

        {canFin && (
          <div className="mt-4">
            <LandedCostPanel file={file} />
          </div>
        )}
      </div>

      <aside>
        <h3 className="mb-2 font-display text-sm font-bold text-ink">What's pending</h3>
        {missing.length === 0 ? (
          <div className="rounded-card border border-border bg-white p-3 text-sm text-muted shadow-card">
            All required documents are in.
          </div>
        ) : (
          <button
            onClick={onGoDocs}
            className="w-full rounded-card border border-amber/30 bg-amber/5 p-3 text-left shadow-card"
          >
            <div className="text-sm font-bold text-ink">{missing.length} document(s) pending</div>
            <div className="mt-1 text-[11px] text-muted">{missing.map((d) => d.label ?? d.type).join(', ')}</div>
          </button>
        )}
      </aside>
    </div>
  );
}

const PAY_TYPES: PaymentType[] = ['advance', 'balance', 'freight', 'insurance', 'duty', 'cha_charges', 'bank_charges', 'other'];
const CURRENCIES: Currency[] = ['USD', 'EUR', 'CNY', 'INR'];
const inputCls = 'w-full rounded-card border border-border px-3 py-2.5 text-sm outline-none focus:border-navy';

function AddPaymentModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (p: { type: PaymentType; amount: number; currency: Currency; due: string }) => void;
}) {
  const [type, setType] = useState<PaymentType>('balance');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [due, setDue] = useState('');
  const valid = Number(amount) > 0 && due.trim();

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
          <select value={type} onChange={(e) => setType(e.target.value as PaymentType)} className={inputCls}>
            {PAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-semibold text-muted">Amount</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={inputCls} />
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
          <span className="mb-1 block text-xs font-semibold text-muted">Due date</span>
          <input value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} placeholder="e.g. 30 Jun 2026" />
        </label>
      </div>
    </Modal>
  );
}

function AddInvoiceModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (d: { supplier: string; invoiceNumber: string; usd: number; currency: Currency; product: string }) => void;
}) {
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [product, setProduct] = useState('');
  const [usd, setUsd] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const valid = supplier.trim() && invoiceNumber.trim() && Number(usd) > 0;

  return (
    <Modal
      title="Add invoice"
      subtitle="A second supplier can share this BL / clearance"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onAdd({ supplier, invoiceNumber, usd: Number(usd), currency, product });
              onClose();
            }}
          >
            Add invoice
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Supplier</span>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Invoice no</span>
          <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Product</span>
          <input value={product} onChange={(e) => setProduct(e.target.value)} className={inputCls} />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-semibold text-muted">Amount</span>
            <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="numeric" className={inputCls} />
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
      </div>
    </Modal>
  );
}
