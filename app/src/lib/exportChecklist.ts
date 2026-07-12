// Builders for export document checklists and invoices. mkExportChecklist
// produces the FILE-level docs only (never CI/PL — those live on each
// ExportInvoice via mkExportInvoice). Mirrors checklist.ts.

import type { Currency, Doc, ExportInvoice, Incoterm, Mode } from '../types';
import { mkDoc } from './checklist';
import { isRequiredExport } from './deriveExport';
import { APPROX_INR_RATE } from './format';

const exportFileDocOrder = (mode: Mode): string[] => [
  'lut_bond',
  'certificate_of_origin',
  'insurance_copy',
  mode === 'air' ? 'awb' : 'bill_of_lading',
  'shipping_bill',
  'firc_brc',
];

export function mkExportChecklist(mode: Mode, incoterm: Incoterm): Doc[] {
  return exportFileDocOrder(mode).map((t) => mkDoc(t, 'missing', isRequiredExport(t, { mode, incoterm })));
}

export function mkExportInvoiceDocs(): { ci: Doc; pl: Doc } {
  return {
    ci: mkDoc('export_commercial_invoice', 'missing', true),
    pl: mkDoc('export_packing_list', 'missing', true),
  };
}

let exportInvSeq = 0;

export interface ExportInvoiceDraft {
  buyer: string;
  invoiceNumber: string;
  usd: number;
  currency?: Currency;
  invoiceDate?: string;
  product?: string;
  qty?: string;
  weight?: string;
  hsn?: string;
  rate?: number;
}

export function mkExportInvoice(draft: ExportInvoiceDraft): ExportInvoice {
  const currency = draft.currency ?? 'USD';
  const { ci, pl } = mkExportInvoiceDocs();
  return {
    id: `exp-inv-${Date.now()}-${exportInvSeq++}`,
    buyer: draft.buyer,
    invoiceNumber: draft.invoiceNumber,
    invoiceDate: draft.invoiceDate ?? '',
    product: draft.product ?? '',
    qty: draft.qty ?? '',
    weight: draft.weight,
    hsn: draft.hsn,
    usd: draft.usd,
    currency,
    rate: draft.rate ?? APPROX_INR_RATE[currency],
    ci,
    pl,
  };
}
