import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Plus, Ship, Sparkles, Trash2 } from 'lucide-react';
import type { Currency, Incoterm, Mode, Priority } from '../types';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/Button';
import { cx } from '../lib/cx';
import { APPROX_INR_RATE, inr } from '../lib/format';
import { TEMPLATES, USERS } from '../data/seed';
import { useStore, type BlankInput } from '../store/store';
import type { InvoiceDraft } from '../lib/checklist';

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full rounded-card border border-border px-3 py-2.5 text-sm outline-none focus:border-navy';

export function CreateFile() {
  const nav = useNavigate();
  const { createFromTemplate, createBlank } = useStore();
  const [view, setView] = useState<'pick' | 'template' | 'blank'>('pick');
  const [tplId, setTplId] = useState<string | null>(null);

  return (
    <>
      <TopBar title="New import file" subtitle="Pick a template — 3 taps" back />
      <Page>
        {view === 'pick' && (
          <PickView
            onTemplate={(id) => {
              setTplId(id);
              setView('template');
            }}
            onBlank={() => setView('blank')}
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
            onBack={() => setView('pick')}
            onCreate={(input) => {
              const id = createBlank(input);
              nav(`/files/${id}`);
            }}
          />
        )}
      </Page>
    </>
  );
}

function PickView({ onTemplate, onBlank }: { onTemplate: (id: string) => void; onBlank: () => void }) {
  return (
    <div>
      <h2 className="mb-3 font-display text-base font-bold text-ink">Start from a template</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <button
          onClick={onBlank}
          className="grid place-items-center rounded-card border border-dashed border-divider bg-white p-4 text-center text-muted transition hover:border-navy hover:text-ink"
        >
          <Sparkles size={20} />
          <span className="mt-1 text-sm font-semibold">Blank file</span>
          <span className="text-[11px]">Advanced · 4 steps</span>
        </button>
      </div>
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

function BlankWizard({ onBack, onCreate }: { onBack: () => void; onCreate: (i: BlankInput) => void }) {
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
    eta: '',
    shippingLine: '',
    forwarder: 'OceanLink Logistics',
    cha: 'Speedy Clearing & Forwarding',
    manager: 'Rahul Mehta',
    accountant: 'Priya Shah',
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
                {USERS.filter((u) => u.role === 'import_manager').map((u) => (
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
