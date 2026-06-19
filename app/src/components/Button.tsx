import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

type Variant = 'primary' | 'ghost' | 'danger' | 'amber' | 'green';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-blue',
  ghost: 'border border-border bg-white text-medium hover:border-navy',
  danger: 'bg-red text-white hover:opacity-90',
  amber: 'bg-amber text-navy hover:opacity-90',
  green: 'bg-green text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
