import { useStore } from '../store/store';

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return (
    <div
      className="anim-toast fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-modal md:bottom-8"
      role="status"
      aria-live="polite"
    >
      {toast}
    </div>
  );
}
