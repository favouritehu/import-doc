import type { PaymentExtract } from './ai';

export interface ScanOutcome {
  amount?: string;
  currency?: string;
  note: string;
}

/** Pure decision for what a scan result should do to the Add-Payment form.
 *  amount>0 → prefill amount+currency + "verify" note; else note-only. */
export function interpretScan(r: PaymentExtract, docLabel: string): ScanOutcome {
  if (!r || r.amount <= 0) {
    return { note: "Couldn't read an amount — enter it manually." };
  }
  return {
    amount: String(r.amount),
    currency: r.currency,
    note: `Read from ${docLabel} — verify before saving.`,
  };
}
