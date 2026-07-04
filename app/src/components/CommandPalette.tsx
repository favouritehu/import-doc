// Cmd/Ctrl+K everything-search: party, file number, container number, BL.
// ↑↓ + Enter to jump, Esc to close. Mounted once in AppShell.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useStore } from '../store/store';
import { useIsMobile } from '../lib/useIsMobile';
import { supplierLabel } from '../lib/format';

export function CommandPalette() {
  const { files } = useStore();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setIdx(0);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return files.slice(0, 8);
    return files
      .filter((f) => {
        const hay = [
          supplierLabel(f),
          f.fileNumber,
          f.containerNo ?? '',
          f.blAwb,
          ...f.invoices.map((i) => `${i.supplier} ${i.invoiceNumber}`),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 8);
  }, [files, needle]);

  if (!open) return null;

  const go = (id: number) => {
    setOpen(false);
    nav(isMobile ? `/files/${id}` : `/?file=${id}`);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-navy/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-label="Search imports"
    >
      <div
        className="mx-auto w-full max-w-lg overflow-hidden rounded-card bg-white shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && results[idx]) {
                go(results[idx].id);
              }
            }}
            placeholder="Party, file no, container, BL…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-faint">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">Nothing matches.</p>
          ) : (
            results.map((f, i) => (
              <button
                key={f.id}
                onClick={() => go(f.id)}
                onMouseEnter={() => setIdx(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${i === idx ? 'bg-page' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{supplierLabel(f)}</span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                    {f.fileNumber}
                    {f.containerNo ? ` · ${f.containerNo}` : f.blAwb ? ` · ${f.blAwb}` : ''}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
