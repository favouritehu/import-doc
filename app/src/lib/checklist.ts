// Builders for document checklists and invoices. mkChecklist produces the
// FILE-level docs only (never CI/PL — those live on each Invoice via mkInvoice).

import type { Currency, Doc, DocStatus, Incoterm, Invoice, Mode } from '../types';
import { isRequired } from './derive';
import { docLabel } from './docs';
import { APPROX_INR_RATE } from './format';

export function mkDoc(type: string, status: DocStatus, required: boolean): Doc {
  return {
    type,
    label: docLabel(type),
    status,
    required,
    by: null,
    at: null,
    reason: null,
    version: 1,
  };
}

const fileDocOrder = (mode: Mode): string[] => [
  'proforma_invoice',
  'purchase_order',
  'certificate_of_origin',
  mode === 'air' ? 'awb' : 'bill_of_lading',
  'insurance_copy',
  'payment_proof',
  'freight_invoice',
  'bank_letter',
  'bill_of_entry',
  'duty_challan',
  'assessment_copy',
  'out_of_charge',
  'delivery_order',
];

export function mkChecklist(mode: Mode, incoterm: Incoterm): Doc[] {
  return fileDocOrder(mode).map((t) => mkDoc(t, 'missing', isRequired(t, { mode, incoterm })));
}

export function mkInvoiceDocs(): { ci: Doc; pl: Doc } {
  return {
    ci: mkDoc('commercial_invoice', 'missing', true),
    pl: mkDoc('packing_list', 'missing', true),
  };
}

let invSeq = 0;

export interface InvoiceDraft {
  supplier: string;
  invoiceNumber: string;
  usd: number;
  currency?: Currency;
  invoiceDate?: string;
  product?: string;
  qty?: string;
  hsn?: string;
  rate?: number;
}

export function mkInvoice(draft: InvoiceDraft): Invoice {
  const currency = draft.currency ?? 'USD';
  const { ci, pl } = mkInvoiceDocs();
  return {
    id: `inv-${Date.now()}-${invSeq++}`,
    supplier: draft.supplier,
    invoiceNumber: draft.invoiceNumber,
    invoiceDate: draft.invoiceDate ?? '',
    product: draft.product ?? '',
    qty: draft.qty ?? '',
    hsn: draft.hsn,
    usd: draft.usd,
    currency,
    rate: draft.rate ?? APPROX_INR_RATE[currency],
    ci,
    pl,
  };
}
