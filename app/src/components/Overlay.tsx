import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface OverlayProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

function Header({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3.5">
      <div className="min-w-0">
        <h3 className="font-display text-base font-bold text-ink">{title}</h3>
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-page"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer }: OverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="anim-pop flex max-h-[88vh] w-full flex-col rounded-t-xl2 bg-white shadow-modal sm:max-w-lg sm:rounded-xl2"
        onClick={(e) => e.stopPropagation()}
      >
        <Header title={title} subtitle={subtitle} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function SlideOver({ title, subtitle, onClose, children, footer }: OverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="anim-pop flex h-full w-full flex-col bg-white shadow-slideover sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <Header title={title} subtitle={subtitle} onClose={onClose} />
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
