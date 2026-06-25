import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FileText, Loader2, Plane, Plus, Ship, Sparkles, Trash2, Wand2, Zap } from 'lucide-react';
import type { Currency, Incoterm, Mode, Priority } from '../types';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { cx } from '../lib/cx';
import { APPROX_INR_RATE, inr } from '../lib/format';
import { TEMPLATES } from '../data/seed';
import { useStore, type BlankInput } from '../store/store';
import type { User } from '../types';
import type { InvoiceDraft } from '../lib/checklist';
import { aiExtractText, type ExtractResult } from '../lib/ai';
import { extractText } from '../lib/ocr';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'CNY', 'INR'];
const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'OTHER'];

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-card bg-page p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cx(
            'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
            value === o ? 'bg-navy text-white' : 'text-muted hover:text-ink',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full rounded-card border border-border px-3 py-2.5 text-sm outline-none focus:border-navy';

/** "ETD (departure)" label with a green "set ✓" chip once a date is chosen. */
function EtdLabel({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      ETD (departure)
      {value.trim() && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-green/10 px-1.5 py-px text-[10px] font-bold text-green">
          <Check size={10} /> set
        </span>
      )}
    </span>
  );
}

export function CreateFile() {
  const nav = useNavigate();
  const { createFromTemplate, createBlank, uploadDoc, users } = useStore();
  const [view, setView] = useState<'pick' | 'template' | 'blank' | 'ai' | 'quick'>('pick');
  const [tplId, setTplId] = useState<string | null>(null);

  return (
    <>
      <TopBar title="New import file" subtitle="Choose how to add it" back />
      <Page>
        {view === 'pick' && (
          <PickView
            onTemplate={(id) => {
              setTplId(id);
              setView('template');
            }}
            onBlank={() => setView('blank')}
            onAi={() => setView('ai')}
            onQuick={() => setView('quick')}
          />
        )}
        {view === 'template' && tplId && (
          <TemplateConfirm
            tplId={tplId}
            onBack={() => setView('pick')}
            onCreate={(input) => {
              const tpl = TEMPLATES.find((t) => t.id === tplId)!;
              const id = createFromTemplate({ templateId: tplId, ...input }, tpl);
              nav(`/files/${id}`);
            }}
          />
        )}
        {view === 'blank' && (
          <BlankWizard
            users={users}
            onBack={() => setView('pick')}
            onCreate={(input) => {
              const id = createBlank(input);
              nav(`/files/${id}`);
            }}
          />
        )}
        {view === 'ai' && (
          <AiExtractView
            users={users}
            onBack={() => setView('pick')}
            onCreate={(input) => {
              const id = createBlank(input);
              nav(`/files/${id}`);
            }}
          />
        )}
        {view === 'quick' && (
          <QuickStartView
            users={users}
            onBack={() => setView('pick')}
            onCreate={createBlank}
            onAttachPi={(id, fileName, fileUrl) => uploadDoc(id, 'proforma_invoice', { fileName, fileUrl })}
            onDone={(id) => nav(`/files/${id}`)}
          />
        )}
      </Page>
    </>
  );
}

function PickView({
  onTemplate,
  onBlank,
  onAi,
  onQuick,
}: {
  onTemplate: (id: string) => void;
  onBlank: () => void;
  onAi: () => void;
  onQuick: () => void;
}) {
  return (
    <div>
      <button
        onClick={onAi}
        className="anim-pop mb-5 flex w-full items-center gap-3 rounded-card border border-navy/20 bg-navy/5 p-4 text-left transition hover:border-navy"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy text-white">
          <Wand2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold text-ink">Extract from a document</span>
            <span className="rounded-full bg-amber px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy">AI</span>
          </div>
          <p className="text-xs text-muted">
            Upload an invoice PDF or photo — AI fills the file + invoices for you to review.
          </p>
        </div>
      </button>
      <button
        onClick={onQuick}
        className="anim-pop mb-5 flex w-full items-center gap-3 rounded-card border border-border bg-white p-4 text-left shadow-card transition hover:border-navy"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber/15 text-amber">
          <Zap size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-display text-sm font-bold text-ink">Quick order — only have the PI</span>
          <p className="text-xs text-muted">
            Create the shipment now with just the supplier. Add BL, ETA, documents &amp; invoice later.
          </p>
        </div>
      </button>
      {TEMPLATES.length > 0 && (
        <>
          <h2 className="mb-3 font-display text-base font-bold text-ink">Or start from a template</h2>
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => {
              const Mode = t.mode === 'air' ? Plane : Ship;
              return (
                <button
                  key={t.id}
                  onClick={() => onTemplate(t.id)}
                  className="anim-pop rounded-card border border-border bg-white p-4 text-left shadow-card transition hover:border-navy"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold text-ink">{t.name}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-page px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
                      <Mode size={12} /> {t.mode}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{t.supplier}</p>
                  <p className="mt-2 text-[11px] text-faint">
                    {t.incoterm} · {t.currency} · {t.requiredDocsCount} docs
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}
      <button
        onClick={onBlank}
        className="flex w-full items-center gap-3 rounded-card border border-dashed border-divider bg-white p-4 text-left text-muted transition hover:border-navy hover:text-ink"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-page text-medium">
          <Sparkles size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-display text-sm font-bold text-ink">Blank file</span>
          <p className="text-xs text-muted">Fill everything in by hand — advanced, 4 steps.</p>
        </div>
      </button>
    </div>
  );
}

function TemplateConfirm({
  tplId,
  onBack,
  onCreate,
}: {
  tplId: string;
  onBack: () => void;
  onCreate: (input: { invoiceNumber: string; usd: number; eta: string; etaDays: number }) => void;
}) {
  const tpl = TEMPLATES.find((t) => t.id === tplId)!;
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [usd, setUsd] = useState('');
  const [eta, setEta] = useState('');
  const valid = invoiceNumber.trim() && Number(usd) > 0 && eta.trim();

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 rounded-card border border-border bg-white p-4 shadow-card">
        <h3 className="font-display text-sm font-bold text-ink">{tpl.name}</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Fact label="Supplier" value={tpl.supplier} />
          <Fact label="Incoterm · Currency" value={`${tpl.incoterm} · ${tpl.currency}`} />
          <Fact label="CHA" value={tpl.cha} />
          <Fact label="Checklist" value={`${tpl.requiredDocsCount} required docs`} />
        </div>
      </div>

      <div className="grid gap-3">
        <Field label="Commercial invoice no">
          <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={inputCls} placeholder="e.g. NB-2490" />
        </Field>
        <Field label={`Invoice amount (${tpl.currency})`}>
          <input value={usd} onChange={(e) => setUsd(e.target.value)} inputMode="numeric" className={inputCls} placeholder="e.g. 84000" />
        </Field>
        <Field label="ETA">
          <input value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} placeholder="e.g. 28 Jun 2026" />
        </Field>
      </div>

      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!valid} onClick={() => onCreate({ invoiceNumber, usd: Number(usd), eta, etaDays: 21 })}>
          Create import file
        </Button>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-faint">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}

const STEPS = ['Supplier & mode', 'Commercial', 'Shipment & CHA', 'Review'];

function BlankWizard({
  users,
  onBack,
  onCreate,
}: {
  users: User[];
  onBack: () => void;
  onCreate: (i: BlankInput) => void;
}) {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState('China');
  const [mode, setMode] = useState<Mode>('sea');
  const [incoterm, setIncoterm] = useState<Incoterm>('FOB');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [invoices, setInvoices] = useState<InvoiceDraft[]>([
    { supplier: '', invoiceNumber: '', usd: 0, currency: 'USD', product: '' },
  ]);
  const [ship, setShip] = useState({
    blAwb: '',
    portLoading: '',
    portArrival: '',
    etd: '',
    eta: '',
    shippingLine: '',
    forwarder: 'OceanLink Logistics',
    cha: 'Speedy Clearing & Forwarding',
    manager: users[0]?.name ?? '',
    accountant: users[0]?.name ?? '',
    priority: 'normal' as Priority,
  });

  const setInv = (idx: number, patch: Partial<InvoiceDraft>) =>
    setInvoices((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  const total = invoices.reduce(
    (s, i) => s + Math.round((i.usd || 0) * APPROX_INR_RATE[i.currency ?? currency]),
    0,
  );

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => (step === 0 ? onBack() : setStep((s) => s - 1));

  const submit = () =>
    onCreate({
      country,
      mode,
      incoterm,
      ...ship,
      etaDays: 21,
      invoices: invoices.map((i) => ({ ...i, currency: i.currency ?? currency })),
    });

  return (
    <div className="mx-auto max-w-2xl">
      {/* step labels — active-only on mobile */}
      <div className="mb-4 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cx(
              'flex items-center gap-1.5 text-xs font-semibold',
              i === step ? 'text-navy' : 'text-faint',
              i === step ? 'flex' : 'hidden sm:flex',
            )}
          >
            <span className={cx('grid h-5 w-5 place-items-center rounded-full text-[10px]', i === step ? 'bg-navy text-white' : 'bg-page')}>
              {i + 1}
            </span>
            {label}
          </div>
        ))}
      </div>

      <div className="rounded-card border border-border bg-white p-4 shadow-card">
        {step === 0 && (
          <div className="grid gap-4">
            <Field label="Origin country">
              <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mode">
              <Segmented value={mode} options={['sea', 'air'] as const} onChange={setMode} />
            </Field>
            <Field label="Incoterm">
              <Segmented value={incoterm} options={INCOTERMS} onChange={setIncoterm} />
            </Field>
            <Field label="Currency">
              <Segmented value={currency} options={CURRENCIES} onChange={setCurrency} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            {invoices.map((row, idx) => (
              <div key={idx} className="rounded-card border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-muted">Invoice {idx + 1}</span>
                  {invoices.length > 1 && (
                    <button onClick={() => setInvoices((p) => p.filter((_, i) => i !== idx))} className="text-faint hover:text-red">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Supplier">
                    <input value={row.supplier} onChange={(e) => setInv(idx, { supplier: e.target.value })} className={inputCls} placeholder="e.g. Ningbo Foods Co." />
                  </Field>
                  <Field label="Invoice no">
                    <input value={row.invoiceNumber} onChange={(e) => setInv(idx, { invoiceNumber: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Product">
                    <input value={row.product ?? ''} onChange={(e) => setInv(idx, { product: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label={`Amount (${row.currency ?? currency})`}>
                    <input
                      value={row.usd || ''}
                      onChange={(e) => setInv(idx, { usd: Number(e.target.value) || 0 })}
                      inputMode="numeric"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              onClick={() => setInvoices((p) => [...p, { supplier: '', invoiceNumber: '', usd: 0, currency, product: '' }])}
              className="inline-flex items-center justify-center gap-1.5 rounded-card border border-dashed border-divider py-2.5 text-sm font-semibold text-navy hover:border-navy"
            >
              <Plus size={15} /> Add another invoice
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="BL / AWB no">
              <input value={ship.blAwb} onChange={(e) => setShip({ ...ship, blAwb: e.target.value })} className={inputCls} />
            </Field>
            <Field label={<EtdLabel value={ship.etd} />}>
              <input type="date" value={ship.etd} onChange={(e) => setShip({ ...ship, etd: e.target.value })} className={inputCls} />
            </Field>
            <Field label="ETA">
              <input value={ship.eta} onChange={(e) => setShip({ ...ship, eta: e.target.value })} className={inputCls} placeholder="e.g. 28 Jun 2026" />
            </Field>
            <Field label="Port of loading">
              <input value={ship.portLoading} onChange={(e) => setShip({ ...ship, portLoading: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Port of arrival">
              <input value={ship.portArrival} onChange={(e) => setShip({ ...ship, portArrival: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Shipping line">
              <input value={ship.shippingLine} onChange={(e) => setShip({ ...ship, shippingLine: e.target.value })} className={inputCls} />
            </Field>
            <Field label="CHA">
              <input value={ship.cha} onChange={(e) => setShip({ ...ship, cha: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Import manager">
              <select value={ship.manager} onChange={(e) => setShip({ ...ship, manager: e.target.value })} className={inputCls}>
                {users.map((u) => (
                  <option key={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <Segmented value={ship.priority} options={['normal', 'high', 'urgent'] as const} onChange={(p) => setShip({ ...ship, priority: p })} />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="mb-2 font-display text-sm font-bold text-ink">Review</h3>
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <Fact label="Origin" value={country} />
              <Fact label="Mode · Incoterm" value={`${mode} · ${incoterm}`} />
              <Fact label="ETA" value={ship.eta || '—'} />
              <Fact label="CHA" value={ship.cha} />
            </div>
            <div className="rounded-card border border-border">
              {invoices.map((row, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border px-3 py-2 text-sm last:border-0">
                  <span className="font-semibold text-ink">{row.supplier || `Invoice ${i + 1}`}</span>
                  <span className="text-muted">
                    {(row.currency ?? currency)} {row.usd.toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-sm font-bold">
                <span>Goods value</span>
                <span>{inr(total)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={prev}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Continue</Button>
        ) : (
          <Button onClick={submit}>Create import file</Button>
        )}
      </div>
    </div>
  );
}

function AiExtractView({
  users,
  onBack,
  onCreate,
}: {
  users: User[];
  onBack: () => void;
  onCreate: (i: BlankInput) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ExtractResult | null>(null);

  const runExtract = async () => {
    setBusy(true);
    setError(null);
    try {
      const text = await extractText(files, setProgress);
      if (!text.trim()) throw new Error('No readable text found — try a clearer photo or a digital PDF.');
      setProgress('Structuring with AI…');
      setForm(await aiExtractText(text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const setFileField = (patch: Partial<ExtractResult['file']>) =>
    setForm((f) => (f ? { ...f, file: { ...f.file, ...patch } } : f));
  const setInv = (idx: number, patch: Partial<ExtractResult['invoices'][number]>) =>
    setForm((f) => (f ? { ...f, invoices: f.invoices.map((v, i) => (i === idx ? { ...v, ...patch } : v)) } : f));

  const create = () => {
    if (!form) return;
    const f = form.file;
    onCreate({
      country: f.country,
      mode: f.mode,
      incoterm: (f.incoterm as Incoterm) || 'FOB',
      blAwb: f.blAwb,
      portLoading: f.portLoading,
      portArrival: f.portArrival,
      etd: f.etd,
      eta: f.eta,
      etaDays: 21,
      shippingLine: f.shippingLine,
      forwarder: f.forwarder,
      cha: f.cha || 'Speedy Clearing & Forwarding',
      manager: users[0]?.name ?? '',
      accountant: users[0]?.name ?? '',
      priority: 'normal',
      invoices: form.invoices.map((i) => ({
        supplier: i.supplier,
        invoiceNumber: i.invoiceNumber,
        usd: i.amount,
        currency: (i.currency as Currency) || 'USD',
        invoiceDate: i.invoiceDate,
        product: i.product,
        weight: i.weight,
        hsn: i.hsn,
      })),
    });
  };

  // ── Upload step ──
  if (!form) {
    return (
      <div className="mx-auto max-w-xl">
        <label className="grid cursor-pointer place-items-center gap-2 rounded-card border border-dashed border-divider bg-white py-12 text-center text-muted transition hover:border-navy">
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
          />
          <FileText size={28} />
          <p className="text-sm font-semibold text-medium">
            {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Choose invoice PDF(s) or photo(s)'}
          </p>
          <p className="text-xs">PDF · JPG · PNG — multiple files = multi-invoice</p>
        </label>

        {files.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {files.map((f, i) => (
              <li key={i} className="truncate rounded-card border border-border bg-white px-3 py-2 text-xs text-medium">
                {f.name}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="mt-3 rounded-card border border-red/30 bg-red/5 p-3 text-sm text-red">{error}</div>
        )}

        <div className="mt-5 flex justify-between">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button disabled={!files.length || busy} onClick={runExtract}>
            {busy ? (
              <>
                <Loader2 size={15} className="animate-spin" /> {progress || 'Working…'}
              </>
            ) : (
              <>
                <Wand2 size={15} /> Extract with AI
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Review step ──
  const f = form.file;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center gap-2 rounded-card border border-green/30 bg-green/5 px-3 py-2 text-sm font-semibold text-green">
        <Wand2 size={15} /> Extracted — review &amp; edit before creating.
      </div>

      <div className="rounded-card border border-border bg-white p-4 shadow-card">
        <h3 className="mb-3 font-display text-sm font-bold text-ink">Shipment</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Origin country">
            <input value={f.country} onChange={(e) => setFileField({ country: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Mode">
            <Segmented value={f.mode} options={['sea', 'air'] as const} onChange={(m) => setFileField({ mode: m })} />
          </Field>
          <Field label="Incoterm">
            <Segmented value={(f.incoterm as Incoterm) || 'OTHER'} options={INCOTERMS} onChange={(v) => setFileField({ incoterm: v })} />
          </Field>
          <Field label="BL / AWB">
            <input value={f.blAwb} onChange={(e) => setFileField({ blAwb: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Port of loading">
            <input value={f.portLoading} onChange={(e) => setFileField({ portLoading: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Port of arrival">
            <input value={f.portArrival} onChange={(e) => setFileField({ portArrival: e.target.value })} className={inputCls} />
          </Field>
          <Field label={<EtdLabel value={f.etd} />}>
            <input type="date" value={f.etd} onChange={(e) => setFileField({ etd: e.target.value })} className={inputCls} />
          </Field>
          <Field label="ETA">
            <input value={f.eta} onChange={(e) => setFileField({ eta: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Shipping line">
            <input value={f.shippingLine} onChange={(e) => setFileField({ shippingLine: e.target.value })} className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="mt-4 rounded-card border border-border bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-ink">Invoices ({form.invoices.length})</h3>
          <button
            onClick={() =>
              setForm((cur) =>
                cur
                  ? { ...cur, invoices: [...cur.invoices, { supplier: '', invoiceNumber: '', invoiceDate: '', product: '', qty: '', weight: '', hsn: '', amount: 0, currency: 'USD' }] }
                  : cur,
              )
            }
            className="text-xs font-semibold text-navy hover:underline"
          >
            + Add invoice
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {form.invoices.map((inv, idx) => (
            <div key={idx} className="rounded-card border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-muted">Invoice {idx + 1}</span>
                {form.invoices.length > 1 && (
                  <button
                    onClick={() => setForm((cur) => (cur ? { ...cur, invoices: cur.invoices.filter((_, i) => i !== idx) } : cur))}
                    className="text-faint hover:text-red"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Supplier">
                  <input value={inv.supplier} onChange={(e) => setInv(idx, { supplier: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Invoice no">
                  <input value={inv.invoiceNumber} onChange={(e) => setInv(idx, { invoiceNumber: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Product">
                  <input value={inv.product} onChange={(e) => setInv(idx, { product: e.target.value })} className={inputCls} />
                </Field>
                <Field label="HSN">
                  <input value={inv.hsn} onChange={(e) => setInv(idx, { hsn: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Amount">
                  <input
                    value={inv.amount || ''}
                    onChange={(e) => setInv(idx, { amount: Number(e.target.value) || 0 })}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </Field>
                <Field label="Currency">
                  <select value={inv.currency} onChange={(e) => setInv(idx, { currency: e.target.value })} className={inputCls}>
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={() => setForm(null)}>
          Back
        </Button>
        <Button onClick={create}>Create import file</Button>
      </div>
    </div>
  );
}

function QuickStartView({
  users,
  onBack,
  onCreate,
  onAttachPi,
  onDone,
}: {
  users: User[];
  onBack: () => void;
  onCreate: (i: BlankInput) => number;
  onAttachPi: (id: number, fileName: string, fileUrl: string) => void;
  onDone: (id: number) => void;
}) {
  const [supplier, setSupplier] = useState('');
  const [piNo, setPiNo] = useState('');
  const [product, setProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [country, setCountry] = useState('China');
  const [mode, setMode] = useState<Mode>('sea');
  const [incoterm, setIncoterm] = useState<Incoterm>('FOB');
  const [eta, setEta] = useState('');
  const [pi, setPi] = useState<File | null>(null);
  const valid = supplier.trim().length > 1;

  const create = () => {
    if (valid === false) return;
    const id = onCreate({
      country,
      mode,
      incoterm,
      blAwb: '',
      portLoading: '',
      portArrival: '',
      eta,
      etaDays: 30,
      shippingLine: '',
      forwarder: '',
      cha: '',
      manager: users[0]?.name ?? '',
      accountant: users[0]?.name ?? '',
      priority: 'normal',
      invoices: [
        { supplier: supplier.trim(), invoiceNumber: piNo.trim(), usd: Number(amount) || 0, currency, product: product.trim() },
      ],
    });
    if (pi) {
      const r = new FileReader();
      r.onload = () => {
        onAttachPi(id, pi.name, typeof r.result === 'string' ? r.result : '');
        onDone(id);
      };
      r.readAsDataURL(pi);
    } else {
      onDone(id);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-3 text-sm text-muted">
        Just placing the order? Enter what you have — only the supplier is required. Everything else
        (BL, ETA, ports, commercial invoice, payments) can be added later on the file.
      </p>
      <div className="rounded-card border border-border bg-white p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier (required)">
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} placeholder="e.g. Ningbo Foods Co." autoFocus />
          </Field>
          <Field label="PI / order no">
            <input value={piNo} onChange={(e) => setPiNo(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Product">
            <input value={product} onChange={(e) => setProduct(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Origin country">
            <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} />
          </Field>
          <Field label={`Order amount (${currency})`}>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className={inputCls} />
          </Field>
          <Field label="Currency">
            <Segmented value={currency} options={CURRENCIES} onChange={setCurrency} />
          </Field>
          <Field label="Mode">
            <Segmented value={mode} options={['sea', 'air'] as const} onChange={setMode} />
          </Field>
          <Field label="Incoterm">
            <Segmented value={incoterm} options={INCOTERMS} onChange={setIncoterm} />
          </Field>
          <Field label="Expected ETA (optional)">
            <input value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} placeholder="e.g. 28 Jul 2026" />
          </Field>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-card border border-dashed border-divider px-3 py-2.5 text-sm text-muted transition hover:border-navy">
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => setPi(e.target.files?.[0] ?? null)} />
          <FileText size={16} /> {pi ? pi.name : 'Attach the PI (optional)'}
        </label>
      </div>
      <div className="mt-5 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={valid === false} onClick={create}>
          Create shipment
        </Button>
      </div>
    </div>
  );
}
