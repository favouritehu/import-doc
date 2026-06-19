import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ExternalLink } from 'lucide-react';
import type { ImportFile } from '../types';
import { cx } from '../lib/cx';
import { EXPIRY_LABEL, magicPath } from '../lib/links';
import { useStore } from '../store/store';
import { Modal } from './Overlay';

export function MagicLinkPanel({ file, onClose }: { file: ImportFile; onClose: () => void }) {
  const { showToast } = useStore();
  const nav = useNavigate();
  const [lang, setLang] = useState<'en' | 'zh'>('en');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const fwdPath = magicPath(file.fileNumber, 'forwarder', lang === 'zh' ? 'zh' : undefined);
  const chaPath = magicPath(file.fileNumber, 'cha');

  const copy = (path: string) => {
    navigator.clipboard?.writeText(origin + path).catch(() => undefined);
    showToast('Link copied');
  };

  return (
    <Modal title="Share scoped links" subtitle={`${file.fileNumber} · ${EXPIRY_LABEL}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Forwarder / supplier */}
        <div className="rounded-card border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-ink">Forwarder / Supplier</span>
            <div className="flex rounded-full bg-page p-0.5">
              {(['en', 'zh'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cx(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    lang === l ? 'bg-navy text-white' : 'text-muted',
                  )}
                >
                  {l === 'en' ? 'EN' : '中文'}
                </button>
              ))}
            </div>
          </div>
          <code className="block truncate rounded bg-page px-2 py-1.5 text-[11px] text-medium">{origin + fwdPath}</code>
          <div className="mt-2 flex gap-2">
            <button onClick={() => copy(fwdPath)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:underline">
              <Copy size={13} /> Copy
            </button>
            <button onClick={() => nav(fwdPath)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:underline">
              <ExternalLink size={13} /> Open preview
            </button>
          </div>
        </div>

        {/* CHA */}
        <div className="rounded-card border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-ink">CHA</span>
            <span className="text-[11px] text-muted">English only</span>
          </div>
          <code className="block truncate rounded bg-page px-2 py-1.5 text-[11px] text-medium">{origin + chaPath}</code>
          <div className="mt-2 flex gap-2">
            <button onClick={() => copy(chaPath)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:underline">
              <Copy size={13} /> Copy
            </button>
            <button onClick={() => nav(chaPath)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:underline">
              <ExternalLink size={13} /> Open preview
            </button>
          </div>
        </div>

        <p className="text-[11px] text-muted">
          Each link is scoped to this one file with no navigation. The external party never sees costing, HSN, or other shipments.
        </p>
      </div>
    </Modal>
  );
}
