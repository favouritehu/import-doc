import type { ReactNode } from 'react';
import type { FileStatus, Priority } from '../types';
import { prioMeta, statusMeta, type Tint } from '../lib/docs';

export function Badge({ tint, children, dot }: { tint: Tint; children?: ReactNode; dot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
      style={{ background: tint.bg, color: tint.fg }}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: tint.fg }} />}
      {children ?? tint.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: FileStatus }) {
  return <Badge tint={statusMeta[status]} dot />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'normal') return null;
  return <Badge tint={prioMeta[priority]} />;
}
