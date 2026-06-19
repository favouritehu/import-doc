import type { LucideIcon } from 'lucide-react';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tint,
  color,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tint: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-card border border-border bg-white p-4 text-left shadow-card transition hover:border-navy"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: tint, color }}>
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </button>
  );
}
