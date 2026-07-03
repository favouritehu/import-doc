import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Bell, Check, FileUp, Link2, Loader2, Lock, Pencil, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import type { Currency, Doc, ImportFile, Incoterm, Invoice, Mode, PaymentType, Priority, User } from '../types';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { PriorityBadge, StatusBadge } from '../components/Badge';
import { ProgressStepper } from '../components/ProgressStepper';
import { ShipmentTimeline } from '../components/ShipmentTimeline';
import { DocumentChecklist, type DocGroup } from '../components/DocumentChecklist';
import { ShipmentTracking } from '../components/ShipmentTracking';
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
import { APPROX_INR_RATE, fileValueInr, inr, invoiceInr, supplierLabel } from '../lib/format';
import { COMMON_FILE_DOCS, CUSTOMS_DOCS, PAYMENT_LABELS, docLabel } from '../lib/docs';
import { aiClassify, aiChase, aiUpdate, sendTestReminder, AiError, type ClassifyResult, type UpdateFields } from '../lib/ai';
import { fmtDate, isoOf, parseDate, todayIso } from '../lib/dates';
import { shipmentReminders } from '../lib/reminders';
import { RolePolicy } from '../lib/rolePolicy';
import { useStore, type AddDocInput } from '../store/store';

/** Normalize any date string (legacy "08 Jun 2026", dd/mm/yyyy, ISO) to ISO for
 *  a <input type="date">; '' if unparseable. */
const toIso = (s?: string | null): string => {
  const d = parseDate(s);
  return d ? isoOf(d) : '';
};

export function FileDetail() {
  const { id } = useParams();
  const store = useStore();
  const file = store.getFile(Number(id));
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
  return (
    <>
      <TopBar title={supplierLabel(file)} subtitle={file.fileNumber} back />
      <FileDetailBody file={file} />
    </>
  );
}

/** The file workspace body (no TopBar) — shared by the /files/:id route and the
 *  parties Workspace detail pane. `onDeleted` lets the Workspace stay in place
 *  (clear its ?file param) instead of being dumped onto /files. */
export function FileDetailBody({ file, onDeleted }: { file: ImportFile; onDeleted?: () => void }) {
  const nav = useNavigate();
  const store = useStore();
  const { role } = store;
  const [params, setParams] = useSearchParams();
  const [slide, setSlide] = useState<{ type: string; invoiceId?: string } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [addPay, setAddPay] = useState(false);
  const [addInv, setAddInv] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editFile, setEditFile] = useState(false);
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [addDoc, setAddDoc] = useState(false);
  const [addScope, setAddScope] = useState<{ invoiceId: string; supplier: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [chaseOpen, setChaseOpen] = useState(false);

  const canFin = RolePolicy.canSeeFinancials(role);
  const canHsn = RolePolicy.canSeeHsn(role);
  const canClose = RolePolicy.canMarkClosed(role);
  const canDelete = RolePolicy.canDelete(role);
  const status = deriveStatus(file);
  const [who, whoRole] = responsibleOf(file);

  const tab = params.get('tab') ?? 'summary';
  // Merge — preserve other params (e.g. ?file in the Workspace) when switching tabs.
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };
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
      if (inv && inv.ci.type === slide.type) return inv.ci;
      if (inv && inv.pl.type === slide.type) return inv.pl;
      return file.docs.find((d) => d.type === slide.type && d.invoiceId === slide.invoiceId) ?? null;
    }
    return file.docs.find((d) => d.type === slide.type && !d.invoiceId) ?? null;
  })();

  // Show only documents the user has actually added — never the empty checklist.
  const added = (ds: Doc[]) => ds.filter((d) => d.status !== 'missing');
  const sharedDocs = added(file.docs.filter((d) => !d.invoiceId));
  const docGroups: DocGroup[] = [
    ...file.invoices.map((inv, i) => ({
      key: inv.id,
      title: `Invoice ${i + 1} · ${inv.supplier}`,
      subtitle: inv.invoiceNumber,
      invoiceId: inv.id,
      docs: added([inv.ci, inv.pl, ...file.docs.filter((d) => d.invoiceId === inv.id)]),
    })),
    ...(sharedDocs.length
      ? [{ key: 'shared', title: 'Shared documents', subtitle: 'One clearance', docs: sharedDocs }]
      : []),
  ];
  const reqMissingCount = requiredMissingDocs(file).length;

  // Soonest ETD/ETA reminder — used to fire a test email through n8n (admin).
  const nextReminder = shipmentReminders(file, todayIso())[0];
  const sendReminder = async () => {
    if (!nextReminder) return;
    try {
      await sendTestReminder({
        fileNumber: file.fileNumber,
        kind: nextReminder.kind,
        date: nextReminder.date,
        daysLeft: nextReminder.daysLeft,
        suppliers: [...new Set(file.invoices.map((i) => i.supplier))],
        product: file.invoices[0]?.product,
      });
      store.showToast('Test reminder sent');
    } catch (e) {
      store.showToast(e instanceof AiError && !e.recoverable ? 'n8n reminders not configured' : 'Reminder failed');
    }
  };

  return (
    <>
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

          <div className="mt-4 border-t border-border pt-3">
            <ShipmentTimeline file={file} variant="detail" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setLinkOpen(true)}>
              <Link2 size={15} /> Generate link
            </Button>
            <Button variant="ghost" onClick={() => setTab('documents')}>
              <Upload size={15} /> Documents
            </Button>
            <Button variant="ghost" onClick={() => setEditFile(true)}>
              <Pencil size={15} /> Edit details
            </Button>
            <Button variant="ghost" onClick={() => setPasteOpen(true)}>
              <Sparkles size={15} /> Paste update
            </Button>
            {role === 'admin' && nextReminder && (
              <Button variant="ghost" onClick={sendReminder}>
                <Bell size={15} /> Test reminder
              </Button>
            )}
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
            onEditInvoice={(inv) => setEditInv(inv)}
            onEditFile={() => setEditFile(true)}
            onGoDocs={() => setTab('documents')}
          />
        )}

        {tab === 'documents' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-ink">Documents</h3>
              <div className="flex items-center gap-2">
                {reqMissingCount > 0 && (
                  <Button variant="ghost" onClick={() => setChaseOpen(true)}>
                    <Sparkles size={15} /> Draft chase
                  </Button>
                )}
                <Button onClick={() => setAddDoc(true)}>
                  <Plus size={15} /> Add document
                </Button>
              </div>
            </div>
            {docGroups.length > 0 ? (
              <DocumentChecklist
                groups={docGroups}
                onRow={(d, invoiceId) => setSlide({ type: d.type, invoiceId })}
                onAddFile={(invoiceId) => {
                  const inv = file.invoices.find((i) => i.id === invoiceId);
                  setAddScope({ invoiceId, supplier: inv?.supplier ?? '' });
                }}
              />
            ) : (
              <div className="grid place-items-center gap-2 rounded-card border border-dashed border-divider bg-page py-12 text-center">
                <FileUp size={26} className="text-faint" />
                <p className="text-sm font-semibold text-medium">No documents yet</p>
                <p className="max-w-xs text-xs text-muted">
                  Add any document you have — invoice, packing list, BL, a photo or PDF. Tap “Add document”.
                </p>
              </div>
            )}
            {reqMissingCount > 0 && (
              <p className="text-[11px] text-muted">
                {reqMissingCount} required {reqMissingCount === 1 ? 'document is' : 'documents are'} still missing — status
                stays “Docs Pending” until they’re added.
              </p>
            )}
          </div>
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
      {addInv && <AddInvoiceModal canFin={canFin} onClose={() => setAddInv(false)} onAdd={(d) => store.addInvoice(file.id, d)} />}
      {addScope && (
        <AddPartyFileModal
          supplier={addScope.supplier}
          onClose={() => setAddScope(null)}
          onAdd={(d) =>
            store.addDocument(file.id, {
              type: `custom-${Date.now()}`,
              label: d.label,
              invoiceId: addScope.invoiceId,
              fileName: d.fileName,
              fileUrl: d.fileUrl,
            })
          }
        />
      )}
      {addDoc && (
        <AddDocumentModal
          file={file}
          onClose={() => setAddDoc(false)}
          onAdd={(d) => store.addDocument(file.id, d)}
        />
      )}
      {editFile && (
        <EditFileModal
          file={file}
          users={store.users}
          onClose={() => setEditFile(false)}
          onSave={(patch) => store.updateFile(file.id, patch)}
        />
      )}
      {pasteOpen && (
        <PasteUpdateModal
          file={file}
          onClose={() => setPasteOpen(false)}
          onApply={(patch) => {
            store.updateFile(file.id, patch);
            store.showToast(`Updated ${Object.keys(patch).length} field(s)`);
          }}
        />
      )}
      {chaseOpen && <ChaseModal file={file} onClose={() => setChaseOpen(false)} />}
      {editInv && (
        <EditInvoiceModal
          inv={editInv}
          canFin={canFin}
          canHsn={canHsn}
          onClose={() => setEditInv(null)}
          onSave={(patch) => store.updateInvoice(file.id, editInv.id, patch)}
        />
      )}
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
                  if (onDeleted) onDeleted();
                  else nav('/files');
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
  onEditInvoice,
  onEditFile,
  onGoDocs,
}: {
  file: ReturnType<typeof useStore>['files'][number];
  canFin: boolean;
  canHsn: boolean;
  canDelete: boolean;
  onAddInvoice: () => void;
  onRemoveInvoice: (invId: string) => void;
  onEditInvoice: (inv: Invoice) => void;
  onEditFile: () => void;
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
        <div className="mb-4">
          <ShipmentTracking file={file} />
        </div>
        <div className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">Shipment</h3>
            <button onClick={onEditFile} className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:underline">
              <Pencil size={12} /> Edit
            </button>
          </div>
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
                  <button onClick={() => onEditInvoice(inv)} aria-label="Edit invoice" className="text-faint hover:text-navy">
                    <Pencil size={14} />
                  </button>
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
  canFin,
  onClose,
  onAdd,
}: {
  /** §0 rule 4: without financial access the Amount/Currency fields are hidden and the invoice lands with value 0 (Accountant fills it in). */
  canFin: boolean;
  onClose: () => void;
  onAdd: (d: {
    supplier: string;
    invoiceNumber: string;
    usd: number;
    currency: Currency;
    product: string;
    weight: string;
  }) => void;
}) {
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [product, setProduct] = useState('');
  const [weight, setWeight] = useState('');
  const [usd, setUsd] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const valid = supplier.trim() && invoiceNumber.trim() && (!canFin || Number(usd) > 0);

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
              onAdd({ supplier, invoiceNumber, usd: Number(usd), currency, product, weight });
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
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Weight (optional)</span>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="e.g. 1,250 kg"
            className={inputCls}
          />
        </label>
        {canFin && (
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
        )}
      </div>
    </Modal>
  );
}

function L({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function EditFileModal({
  file,
  users,
  onClose,
  onSave,
}: {
  file: ImportFile;
  users: User[];
  onClose: () => void;
  onSave: (patch: Partial<ImportFile>) => void;
}) {
  const [f, setF] = useState({
    country: file.country,
    mode: file.mode,
    incoterm: file.incoterm,
    blAwb: file.blAwb,
    containerNo: file.containerNo ?? '',
    portLoading: file.portLoading,
    portArrival: file.portArrival,
    etd: toIso(file.etd),
    eta: toIso(file.eta),
    shippingLine: file.shippingLine,
    forwarder: file.forwarder,
    cha: file.cha,
    manager: file.manager,
    accountant: file.accountant,
    priority: file.priority,
    boeNumber: file.boeNumber ?? '',
  });
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const userOpts = (current: string) => (
    <>
      {users.some((u) => u.name === current) ? null : current ? <option>{current}</option> : null}
      {users.map((u) => (
        <option key={u.id}>{u.name}</option>
      ))}
    </>
  );
  return (
    <Modal
      title="Edit details"
      subtitle={file.fileNumber}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave({ ...f, etd: f.etd.trim() || undefined, boeNumber: f.boeNumber.trim() || null });
              onClose();
            }}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Origin country">
          <input value={f.country} onChange={(e) => set({ country: e.target.value })} className={inputCls} />
        </L>
        <L label="Mode">
          <select value={f.mode} onChange={(e) => set({ mode: e.target.value as Mode })} className={inputCls}>
            <option value="sea">sea</option>
            <option value="air">air</option>
          </select>
        </L>
        <L label="Incoterm">
          <select value={f.incoterm} onChange={(e) => set({ incoterm: e.target.value as Incoterm })} className={inputCls}>
            {(['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'OTHER'] as const).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </L>
        <L label="BL / AWB">
          <input value={f.blAwb} onChange={(e) => set({ blAwb: e.target.value })} className={inputCls} />
        </L>
        <L label="Container no (tracking)">
          <input value={f.containerNo} onChange={(e) => set({ containerNo: e.target.value.toUpperCase() })} className={inputCls} placeholder="e.g. MSKU1234567" />
        </L>
        <L label="Port of loading">
          <input value={f.portLoading} onChange={(e) => set({ portLoading: e.target.value })} className={inputCls} />
        </L>
        <L label="Port of arrival">
          <input value={f.portArrival} onChange={(e) => set({ portArrival: e.target.value })} className={inputCls} />
        </L>
        <L
          label={
            <span className="inline-flex items-center gap-1.5">
              ETD (departure)
              {f.etd.trim() && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green/10 px-1.5 py-px text-[10px] font-bold text-green">
                  <Check size={10} /> set
                </span>
              )}
            </span>
          }
        >
          <input type="date" value={f.etd} onChange={(e) => set({ etd: e.target.value })} className={inputCls} />
        </L>
        <L
          label={
            <span className="inline-flex items-center gap-1.5">
              ETA (arrival)
              {f.eta.trim() && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green/10 px-1.5 py-px text-[10px] font-bold text-green">
                  <Check size={10} /> set
                </span>
              )}
            </span>
          }
        >
          <input type="date" value={f.eta} onChange={(e) => set({ eta: e.target.value })} className={inputCls} />
        </L>
        <L label="Shipping line">
          <input value={f.shippingLine} onChange={(e) => set({ shippingLine: e.target.value })} className={inputCls} />
        </L>
        <L label="Forwarder">
          <input value={f.forwarder} onChange={(e) => set({ forwarder: e.target.value })} className={inputCls} />
        </L>
        <L label="CHA">
          <input value={f.cha} onChange={(e) => set({ cha: e.target.value })} className={inputCls} />
        </L>
        <L label="BOE no">
          <input value={f.boeNumber} onChange={(e) => set({ boeNumber: e.target.value })} className={inputCls} />
        </L>
        <L label="Priority">
          <select value={f.priority} onChange={(e) => set({ priority: e.target.value as Priority })} className={inputCls}>
            {(['normal', 'high', 'urgent'] as const).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </L>
        <L label="Import manager">
          <select value={f.manager} onChange={(e) => set({ manager: e.target.value })} className={inputCls}>
            {userOpts(f.manager)}
          </select>
        </L>
        <L label="Accountant">
          <select value={f.accountant} onChange={(e) => set({ accountant: e.target.value })} className={inputCls}>
            {userOpts(f.accountant)}
          </select>
        </L>
      </div>
    </Modal>
  );
}

function EditInvoiceModal({
  inv,
  canFin,
  canHsn,
  onClose,
  onSave,
}: {
  inv: Invoice;
  /** §0 rule 4: Import Manager never sees a financial field — hides Amount/Currency (canFin) and HSN (canHsn); the save patch leaves them untouched. */
  canFin: boolean;
  canHsn: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Invoice>) => void;
}) {
  const [v, setV] = useState({
    supplier: inv.supplier,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    product: inv.product,
    qty: inv.qty,
    weight: inv.weight ?? '',
    hsn: inv.hsn ?? '',
    amount: String(inv.usd || ''),
    currency: inv.currency,
  });
  const set = (patch: Partial<typeof v>) => setV((s) => ({ ...s, ...patch }));
  const valid = v.supplier.trim().length > 0;
  return (
    <Modal
      title="Edit invoice"
      subtitle={inv.invoiceNumber || inv.supplier}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={valid === false}
            onClick={() => {
              onSave({
                supplier: v.supplier.trim(),
                invoiceNumber: v.invoiceNumber.trim(),
                invoiceDate: v.invoiceDate,
                product: v.product,
                qty: v.qty,
                weight: v.weight.trim() || undefined,
                ...(canHsn ? { hsn: v.hsn.trim() || undefined } : {}),
                ...(canFin
                  ? { usd: Number(v.amount) || 0, currency: v.currency, rate: APPROX_INR_RATE[v.currency] }
                  : {}),
              });
              onClose();
            }}
          >
            Save changes
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Supplier">
          <input value={v.supplier} onChange={(e) => set({ supplier: e.target.value })} className={inputCls} />
        </L>
        <L label="Invoice no">
          <input value={v.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} className={inputCls} />
        </L>
        <L label="Invoice date">
          <input value={v.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} className={inputCls} />
        </L>
        <L label="Product">
          <input value={v.product} onChange={(e) => set({ product: e.target.value })} className={inputCls} />
        </L>
        <L label="Quantity">
          <input value={v.qty} onChange={(e) => set({ qty: e.target.value })} className={inputCls} />
        </L>
        <L label="Weight">
          <input value={v.weight} onChange={(e) => set({ weight: e.target.value })} placeholder="e.g. 1,250 kg" className={inputCls} />
        </L>
        {canHsn && (
          <L label="HSN">
            <input value={v.hsn} onChange={(e) => set({ hsn: e.target.value })} className={inputCls} />
          </L>
        )}
        {canFin && (
          <>
            <L label="Amount">
              <input value={v.amount} onChange={(e) => set({ amount: e.target.value })} inputMode="numeric" className={inputCls} />
            </L>
            <L label="Currency">
              <select value={v.currency} onChange={(e) => set({ currency: e.target.value as Currency })} className={inputCls}>
                {(['USD', 'EUR', 'CNY', 'INR'] as const).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </L>
          </>
        )}
      </div>
    </Modal>
  );
}

// File-first: pick any file → name auto-fills → type is an optional tag. No long
// checklist to wade through — the user adds exactly what they have.
/** Match an AI-classified CI/PL to one of the file's invoices (by number, then supplier). */
function matchInvoice(invoices: Invoice[], c: ClassifyResult): Invoice | null {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cn = norm(c.invoiceNumber);
  if (cn) {
    const byNum = invoices.find((i) => {
      const n = norm(i.invoiceNumber);
      return n && (n === cn || n.includes(cn) || cn.includes(n));
    });
    if (byNum) return byNum;
  }
  const cs = norm(c.supplier);
  if (cs) {
    const bySup = invoices.find((i) => {
      const s = norm(i.supplier);
      return s && (s.includes(cs) || cs.includes(s));
    });
    if (bySup) return bySup;
  }
  return invoices.length === 1 ? invoices[0] : null;
}

function AddPartyFileModal({
  supplier,
  onClose,
  onAdd,
}: {
  supplier: string;
  onClose: () => void;
  onAdd: (d: { label: string; fileName: string; fileUrl: string }) => void;
}) {
  const { uploadFile } = useStore();
  const [picked, setPicked] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!picked || !name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { fileName, fileUrl } = await uploadFile(picked);
      onAdd({ label: name.trim(), fileName, fileUrl });
      onClose();
    } catch {
      setBusy(false);
      setErr('Could not upload — try again.');
    }
  };
  return (
    <Modal
      title="Add file"
      subtitle={`For ${supplier || 'this party'}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked || !name.trim() || busy} onClick={submit}>
            {busy ? 'Uploading…' : 'Add file'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">File</span>
          <input
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setPicked(f);
              if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''));
            }}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Name this file</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder="e.g. Fumigation certificate"
          />
        </label>
        {err && <p className="text-xs font-semibold text-red">{err}</p>}
      </div>
    </Modal>
  );
}

function AddDocumentModal({
  file,
  onClose,
  onAdd,
}: {
  file: ImportFile;
  onClose: () => void;
  onAdd: (d: AddDocInput) => void;
}) {
  const { uploadFile } = useStore();
  const [picked, setPicked] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [typeValue, setTypeValue] = useState('other');
  const [classifying, setClassifying] = useState(false);
  const [ai, setAi] = useState<{ label: string; confidence: number; matched: boolean } | null>(null);
  const [aiNote, setAiNote] = useState('');

  // File-level doc types the type select offers (must include any type the AI can emit).
  const transportDoc = file.mode === 'air' ? 'awb' : 'bill_of_lading';
  const fileDocTypes = [...COMMON_FILE_DOCS, transportDoc, 'coa', ...CUSTOMS_DOCS];
  const typeOptions: { value: string; label: string }[] = [
    { value: 'other', label: 'Other / custom' },
    ...file.invoices.flatMap((inv) => [
      { value: `inv:${inv.id}:commercial_invoice`, label: `Commercial Invoice — ${inv.supplier}` },
      { value: `inv:${inv.id}:packing_list`, label: `Packing List — ${inv.supplier}` },
    ]),
    ...fileDocTypes.map((t) => ({ value: `file:${t}`, label: docLabel(t) })),
  ];

  // AI result -> select the right slot + suggest a title. Falls back to manual.
  const applyClassification = (c: ClassifyResult) => {
    const isInvoiceDoc = c.docType === 'commercial_invoice' || c.docType === 'packing_list';
    if (isInvoiceDoc) {
      const inv = matchInvoice(file.invoices, c);
      if (inv) {
        setTypeValue(`inv:${inv.id}:${c.docType}`);
        setName(`${docLabel(c.docType)} — ${inv.supplier}`);
        setAi({ label: `${docLabel(c.docType)} → ${inv.supplier}`, confidence: c.confidence, matched: true });
        return;
      }
    }
    if (c.docType !== 'other' && fileDocTypes.includes(c.docType)) {
      setTypeValue(`file:${c.docType}`);
      setName(docLabel(c.docType));
      setAi({ label: docLabel(c.docType), confidence: c.confidence, matched: true });
      return;
    }
    // Couldn't confidently slot it — leave as custom, keep the filename-based name.
    setAi({
      label: c.docType === 'other' ? 'Unrecognised type' : docLabel(c.docType),
      confidence: c.confidence,
      matched: false,
    });
  };

  const onPick = async (f: File) => {
    setPicked(f);
    setAi(null);
    setAiNote('');
    setTypeValue('other');
    setName(f.name.replace(/\.[^.]+$/, ''));
    setClassifying(true);
    try {
      applyClassification(await aiClassify(f));
    } catch (e) {
      setAiNote(
        e instanceof AiError && !e.recoverable
          ? 'AI not running — pick the type below manually.'
          : 'Could not auto-detect — pick the type below.',
      );
    } finally {
      setClassifying(false);
    }
  };

  const submit = async () => {
    if (!picked || !name.trim()) return;
    let up: { fileName: string; fileUrl: string };
    try {
      up = await uploadFile(picked); // server volume in shared mode, else inline
    } catch {
      setAiNote('Could not upload the file — pick it again.');
      return;
    }
    const { fileName, fileUrl } = up;
    if (typeValue === 'other') {
      onAdd({ type: `custom-${Date.now()}`, label: name.trim(), fileName, fileUrl });
    } else if (typeValue.startsWith('inv:')) {
      const [, invoiceId, type] = typeValue.split(':');
      onAdd({ type, invoiceId, fileName, fileUrl });
    } else {
      onAdd({ type: typeValue.slice(5), fileName, fileUrl });
    }
    onClose();
  };

  return (
    <Modal
      title="Add document"
      subtitle="Any file — AI auto-detects the type"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!picked || !name.trim() || classifying} onClick={submit}>
            Add document
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="grid cursor-pointer place-items-center gap-2 rounded-card border border-dashed border-divider bg-page py-8 text-center text-muted hover:border-navy">
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void onPick(f);
            }}
          />
          {picked ? <FileUp size={26} className="text-navy" /> : <Upload size={26} />}
          <span className="text-sm font-semibold text-medium">{picked ? picked.name : 'Choose a file'}</span>
          <span className="text-xs">Any type · image, PDF or document</span>
        </label>

        {/* AI auto-detect feedback */}
        {classifying && (
          <div className="flex items-center gap-2 rounded-card bg-navy/5 px-3 py-2 text-xs font-semibold text-navy">
            <Loader2 size={14} className="animate-spin" /> Reading document with AI…
          </div>
        )}
        {!classifying && ai && (
          <div
            className={cx(
              'flex items-center gap-2 rounded-card px-3 py-2 text-xs font-semibold',
              ai.matched ? 'bg-green/10 text-green' : 'bg-amber/10 text-amber',
            )}
          >
            <Sparkles size={14} />
            {ai.matched ? 'Detected' : 'Best guess'}: {ai.label}
            <span className="ml-auto font-medium opacity-70">{Math.round(ai.confidence * 100)}%</span>
          </div>
        )}
        {!classifying && aiNote && <p className="text-xs text-muted">{aiNote}</p>}

        <L label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bank NOC" className={inputCls} />
        </L>
        <L label={ai?.matched ? 'Type (AI-detected — change if wrong)' : 'Type'}>
          <select value={typeValue} onChange={(e) => setTypeValue(e.target.value)} className={inputCls}>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </L>
      </div>
    </Modal>
  );
}

// ── AI: draft a bilingual supplier chase message for missing docs ──────
function ChaseModal({ file, onClose }: { file: ImportFile; onClose: () => void }) {
  const missing = requiredMissingDocs(file).map((d) => d.label ?? docLabel(d.type));
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    aiChase({
      supplier: supplierLabel(file),
      invoiceNumber: file.invoices[0]?.invoiceNumber,
      fileNumber: file.fileNumber,
      missing,
      lang: 'both',
    })
      .then((t) => alive && (setText(t), setLoading(false)))
      .catch((e) => alive && (setErr(e instanceof AiError ? e.message : 'Could not draft message'), setLoading(false)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Modal
      title="Draft chase message"
      subtitle={`${missing.length} pending · ${supplierLabel(file)}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full bg-green px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90',
              (!text || loading) && 'pointer-events-none opacity-50',
            )}
          >
            WhatsApp
          </a>
          <Button disabled={!text || loading} onClick={copy}>
            {copied ? <Check size={15} /> : null} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="rounded-card bg-page px-3 py-2 text-xs text-muted">
          Pending: {missing.join(', ') || '—'}
        </div>
        {loading && (
          <div className="flex items-center gap-2 rounded-card bg-navy/5 px-3 py-6 text-sm font-semibold text-navy">
            <Loader2 size={16} className="animate-spin" /> Drafting a bilingual message…
          </div>
        )}
        {err && <p className="text-xs text-red">{err}</p>}
        {!loading && !err && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className={cx(inputCls, 'font-mono text-[13px] leading-relaxed')}
          />
        )}
      </div>
    </Modal>
  );
}

// ── AI: paste a supplier WhatsApp/email → propose shipment field changes ──
const UPDATE_LABELS: Record<keyof UpdateFields, string> = {
  etd: 'ETD (departure)',
  eta: 'ETA (arrival)',
  blAwb: 'BL / AWB',
  shippingLine: 'Shipping line',
  forwarder: 'Forwarder',
  portLoading: 'Port of loading',
  portArrival: 'Port of arrival',
};

function PasteUpdateModal({
  file,
  onClose,
  onApply,
}: {
  file: ImportFile;
  onClose: () => void;
  onApply: (patch: Partial<ImportFile>) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [fields, setFields] = useState<UpdateFields | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const run = async () => {
    setLoading(true);
    setErr('');
    try {
      const f = await aiUpdate(text);
      setFields(f);
      setAccepted(Object.fromEntries(Object.keys(f).map((k) => [k, true])));
    } catch (e) {
      setErr(e instanceof AiError ? e.message : 'Could not read the update');
    } finally {
      setLoading(false);
    }
  };

  const entries = fields ? (Object.entries(fields) as [keyof UpdateFields, string][]).filter(([, v]) => v) : [];
  const isDate = (k: keyof UpdateFields) => k === 'etd' || k === 'eta';
  const show = (k: keyof UpdateFields, v: string) => (isDate(k) ? fmtDate(v) || v : v);

  const apply = () => {
    const patch: Partial<ImportFile> = {};
    entries.forEach(([k, v]) => {
      if (accepted[k]) (patch as Record<string, unknown>)[k] = v;
    });
    if (Object.keys(patch).length) onApply(patch);
    onClose();
  };

  return (
    <Modal
      title="Paste an update"
      subtitle="Supplier WhatsApp/email → AI fills the changes"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {fields ? (
            <Button disabled={!entries.some(([k]) => accepted[k])} onClick={apply}>
              Apply changes
            </Button>
          ) : (
            <Button disabled={!text.trim() || loading} onClick={run}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Extract
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-3">
        {!fields && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="e.g. Cargo loaded, sailing 2 Jul, BL SUZH26-0501, via Maersk"
            className={inputCls}
          />
        )}
        {err && <p className="text-xs text-red">{err}</p>}
        {fields && entries.length === 0 && (
          <p className="text-sm text-muted">No shipment fields found in that message.</p>
        )}
        {fields && entries.length > 0 && (
          <div className="grid gap-2">
            <p className="text-xs text-muted">Review and apply:</p>
            {entries.map(([k, v]) => (
              <label
                key={k}
                className="flex items-center gap-3 rounded-card border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={!!accepted[k]}
                  onChange={(e) => setAccepted((a) => ({ ...a, [k]: e.target.checked }))}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-muted">{UPDATE_LABELS[k]}</div>
                  <div className="truncate">
                    <span className="text-faint line-through">
                      {show(k, (file as unknown as Record<string, unknown>)[k] as string) || '—'}
                    </span>{' '}
                    <span className="font-semibold text-ink">→ {show(k, v)}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
