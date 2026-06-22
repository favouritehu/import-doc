import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check, CheckCircle2, Globe, Plane, Ship, Upload } from 'lucide-react';
import { CHAStatusChecklist } from '../components/CHAStatusChecklist';
import { Logo } from '../components/Sidebar';
import { cx } from '../lib/cx';
import { docLabel, docZh } from '../lib/docs';
import { tr, type Lang } from '../i18n';
import { useStore } from '../store/store';

export function MagicLinkPage({ party }: { party: 'forwarder' | 'cha' }) {
  const { fileNumber } = useParams();
  const { getFileByNumber, ready } = useStore();
  const file = getFileByNumber(fileNumber ?? '');
  const [params, setParams] = useSearchParams();
  const isCha = party === 'cha';

  const langParam = params.get('lang');
  const lang: Lang = isCha
    ? 'en'
    : langParam === 'zh'
      ? 'zh'
      : langParam === 'en'
        ? 'en'
        : file?.country === 'China'
          ? 'zh'
          : 'en';
  const t = (k: string) => tr(lang, k);

  const [uploadedNames, setUploadedNames] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!ready) {
    return (
      <Shell>
        <div className="anim-pulse rounded-card bg-white p-8 text-center text-sm font-semibold text-muted">
          Loading…
        </div>
      </Shell>
    );
  }

  if (!file) {
    return (
      <Shell>
        <div className="rounded-card bg-white p-8 text-center">
          <p className="font-display text-lg font-bold text-ink">Invalid or expired link</p>
          <p className="mt-1 text-sm text-muted">Please request a new link from Favourite Fab.</p>
        </div>
      </Shell>
    );
  }

  const Mode = file.mode === 'air' ? Plane : Ship;
  const inv0 = file.invoices[0];

  const docRow = (key: string, type: string, tag?: string) => {
    const name = uploadedNames[key];
    const done = !!name;
    return (
      <div key={key} className="flex items-center justify-between gap-3 rounded-card border border-border bg-white px-3 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{lang === 'zh' ? docZh(type) : docLabel(type)}</div>
          <div className="truncate text-[11px] text-muted">
            {done ? name : lang === 'zh' ? docLabel(type) : docZh(type)}
            {!done && tag ? ` · ${tag}` : ''}
          </div>
        </div>
        <label
          className={cx(
            'inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold',
            done ? 'bg-green/10 text-green' : 'bg-navy text-white hover:bg-blue',
          )}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setUploadedNames((u) => ({ ...u, [key]: f.name }));
            }}
          />
          {done ? <Check size={14} /> : <Upload size={14} />}
          {done ? t('uploaded') : t('upload')}
        </label>
      </div>
    );
  };

  if (submitted) {
    return (
      <Shell>
        <div className="rounded-card bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto text-green" size={40} />
          <p className="mt-3 font-display text-lg font-bold text-ink">{t('thanks')}</p>
          <p className="mt-1 text-sm text-muted">{file.fileNumber}</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="overflow-hidden rounded-xl2 bg-white shadow-modal">
        {/* header */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('eyebrow')}</div>
              <div className="flex items-center gap-1.5 font-display text-base font-bold text-ink">
                {file.fileNumber} <Mode size={14} className="text-faint" />
              </div>
            </div>
          </div>
          {!isCha && (
            <div className="flex rounded-full bg-page p-0.5">
              {(['en', 'zh'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setParams(l === 'zh' ? { lang: 'zh' } : { lang: 'en' }, { replace: true })}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                    lang === l ? 'bg-navy text-white' : 'text-muted',
                  )}
                >
                  {l === 'en' ? <Globe size={12} /> : null}
                  {l === 'en' ? 'EN' : '中文'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-5">
          {isCha && file.arrivedOn && file.chaOv.out_of_charge?.[0] !== 'done' && (
            <div className="mb-4 flex items-center gap-2 rounded-card border border-red/30 bg-red/5 px-3 py-2 text-sm font-semibold text-red">
              <AlertTriangle size={16} /> {t('demurrage')}
            </div>
          )}

          <p className="mb-5 text-sm text-medium">{isCha ? t('chaIntro') : t('fwdIntro')}</p>

          {!isCha && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t('shipmentDetails')}</h2>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['supplier', inv0?.supplier ?? ''],
                    ['invoiceNo', inv0?.invoiceNumber ?? ''],
                    ['blAwb', file.blAwb],
                    ['mode', file.mode.toUpperCase()],
                    ['incoterm', file.incoterm],
                    ['pol', file.portLoading],
                    ['poa', file.portArrival],
                    ['eta', file.eta],
                    ['product', inv0?.product ?? ''],
                    ['qty', inv0?.qty ?? ''],
                  ] as [string, string][]
                ).map(([key, val]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-muted">{t(key)}</span>
                    <input
                      defaultValue={val}
                      className="w-full rounded-card border border-border px-3 py-2 text-sm outline-none focus:border-navy"
                    />
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="mb-6">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              {isCha ? t('requestedUploads') : t('requestedDocs')}
            </h2>
            <div className="flex flex-col gap-2">
              {isCha
                ? ['out_of_charge', 'delivery_order'].map((type) => docRow(type, type))
                : [
                    ...file.invoices.flatMap((inv, i) => {
                      const tag = file.invoices.length > 1 ? `#${i + 1} ${inv.supplier}` : undefined;
                      return [
                        docRow(`ci-${inv.id}`, 'commercial_invoice', tag),
                        docRow(`pl-${inv.id}`, 'packing_list', tag),
                      ];
                    }),
                    docRow('pi', 'proforma_invoice'),
                    docRow('coo', 'certificate_of_origin'),
                    docRow('coa', 'coa'),
                  ]}
            </div>
          </section>

          {isCha && (
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{t('customsSteps')}</h2>
              <CHAStatusChecklist chaOv={file.chaOv} editable={false} />
            </section>
          )}

          <button
            onClick={() => setSubmitted(true)}
            className="w-full rounded-full bg-navy py-3 text-sm font-bold text-white hover:bg-blue"
          >
            {isCha ? t('submitCha') : t('submitFwd')}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-navy px-4 py-8">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </div>
  );
}
