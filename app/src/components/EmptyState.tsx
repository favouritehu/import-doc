import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  sub,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-divider bg-white px-6 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-page text-muted">
        <Icon size={22} />
      </div>
      <p className="font-display text-base font-bold text-ink">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-sm text-muted">{sub}</p>}
    </div>
  );
}
