// Money / FX / supplier-label helpers. `fileValueInr` and `supplierLabel` are
// the ONLY sanctioned way to read a file's worth or vendor — ImportFile has no
// top-level supplier/usd mirror, so these aggregate across invoices[].

import type { Currency, ImportFile, Invoice, Payment } from '../types';

export const APPROX_INR_RATE: Record<Currency, number> = {
  USD: 83.2,
  EUR: 90.1,
  CNY: 11.6,
  INR: 1,
};

/** Indian digit grouping: 1234567 -> "12,34,567". */
export function groupAmount(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + last3;
}

export const inr = (n: number): string => '₹' + groupAmount(n);

export const invoiceInr = (inv: Invoice): number => Math.round(inv.usd * inv.rate);

export const fileValueInr = (f: ImportFile): number =>
  f.invoices.reduce((sum, i) => sum + invoiceInr(i), 0);

export function distinctSuppliers(f: ImportFile): string[] {
  return [...new Set(f.invoices.map((i) => i.supplier))];
}

export function supplierLabel(f: ImportFile): string {
  const s = distinctSuppliers(f);
  if (s.length === 0) return '—';
  if (s.length === 1) return s[0];
  return `${s[0]} +${s.length - 1}`;
}

export function payInr(p: Payment): number {
  if (p.inr != null) return p.inr;
  if (p.usd != null && p.rate != null) return Math.round(p.usd * p.rate);
  return 0;
}

/** "USD 12,000 @ ₹83.2" — the FX line accountants read. */
export function fxLine(p: Payment): string {
  if (p.usd != null && p.rate != null) {
    return `${p.currency ?? 'USD'} ${groupAmount(p.usd)} @ ₹${p.rate}`;
  }
  return p.inr != null ? inr(p.inr) : '—';
}

export const fxAmount = (usd: number, cur: Currency): string => `${cur} ${groupAmount(usd)}`;
