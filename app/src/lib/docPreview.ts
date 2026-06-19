// Faux document-preview fields rendered in the FilePreviewModal slide-over.
// Phase A has no real files; these read the structured data we already hold.
// CI/PL take the OWNING invoice (passed in), not the file.

import type { Doc, ImportFile, Invoice } from '../types';
import { fileValueInr, fxAmount, inr } from './format';

export interface PreviewField {
  label: string;
  value: string;
}

export function previewFields(doc: Doc, f: ImportFile, inv?: Invoice): PreviewField[] {
  const shipping: PreviewField[] = [
    { label: 'File', value: f.fileNumber },
    { label: 'BL / AWB', value: f.blAwb || '—' },
    { label: 'Port of Arrival', value: f.portArrival },
    { label: 'ETA', value: f.eta },
  ];

  switch (doc.type) {
    case 'commercial_invoice':
      return [
        { label: 'Supplier', value: inv?.supplier ?? '—' },
        { label: 'Invoice No', value: inv?.invoiceNumber ?? '—' },
        { label: 'Invoice Date', value: inv?.invoiceDate || '—' },
        { label: 'Goods', value: inv?.product || '—' },
        { label: 'Quantity', value: inv?.qty || '—' },
        { label: 'Amount', value: inv ? fxAmount(inv.usd, inv.currency) : '—' },
        { label: 'Incoterm', value: f.incoterm },
      ];
    case 'packing_list':
      return [
        { label: 'Supplier', value: inv?.supplier ?? '—' },
        { label: 'Invoice No', value: inv?.invoiceNumber ?? '—' },
        { label: 'Goods', value: inv?.product || '—' },
        { label: 'Quantity', value: inv?.qty || '—' },
        { label: 'Gross / Net Wt', value: 'see scan' },
        { label: 'Packages', value: 'see scan' },
      ];
    case 'proforma_invoice':
    case 'purchase_order':
      return [
        { label: 'Supplier', value: inv?.supplier ?? f.invoices[0]?.supplier ?? '—' },
        { label: 'Reference', value: inv?.invoiceNumber ?? '—' },
        { label: 'Goods', value: inv?.product ?? f.invoices[0]?.product ?? '—' },
        { label: 'Incoterm', value: f.incoterm },
      ];
    case 'bill_of_lading':
    case 'awb':
      return [
        ...shipping,
        { label: 'Shipping Line', value: f.shippingLine || '—' },
        { label: 'Port of Loading', value: f.portLoading },
        { label: 'Forwarder', value: f.forwarder || '—' },
      ];
    case 'bill_of_entry':
      return [
        { label: 'BOE No', value: f.boeNumber ?? '—' },
        { label: 'BOE Date', value: f.boeDate ?? '—' },
        { label: 'Port', value: f.portArrival },
        { label: 'Assessable Value', value: inr(fileValueInr(f)) },
      ];
    case 'duty_challan':
    case 'assessment_copy':
      return [
        { label: 'BOE No', value: f.boeNumber ?? '—' },
        { label: 'Total Duty', value: inr(f.duty.bcd + f.duty.sws + f.duty.igst + f.duty.cess + f.duty.anti_dumping + f.duty.other) },
        { label: 'IGST', value: inr(f.duty.igst) },
      ];
    case 'out_of_charge':
    case 'delivery_order':
      return [
        ...shipping,
        { label: 'CHA', value: f.cha || '—' },
        { label: 'Arrived On', value: f.arrivedOn ?? '—' },
      ];
    case 'certificate_of_origin':
      return [
        { label: 'Origin', value: f.country },
        { label: 'Supplier', value: inv?.supplier ?? f.invoices[0]?.supplier ?? '—' },
      ];
    case 'insurance_copy':
      return [
        { label: 'Policy', value: 'POL-' + f.fileNumber.replace(/\D/g, '') },
        { label: 'Insured Value', value: inr(fileValueInr(f)) },
      ];
    default:
      return shipping;
  }
}
