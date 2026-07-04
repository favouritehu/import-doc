import { useStore } from '../store/store';

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  const error = toast.kind === 'error';
  return (
    <div
      className={`anim-toast fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-modal md:bottom-8 ${
        error ? 'bg-red' : 'bg-navy'
      }`}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
    >
      {toast.m}
    </div>
  );
}
