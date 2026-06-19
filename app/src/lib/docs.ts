// Document-type tables, status/priority meta, and CHA step definitions.
// Tints live here as data (consumed as inline style), NOT in Tailwind.

import type {
  ChaStepStatus,
  DocStatus,
  FileStatus,
  PayStatus,
  PaymentType,
  Priority,
} from '../types';

export interface Tint {
  label: string;
  bg: string;
  fg: string;
}

// ── Document types ────────────────────────────────────────────────────

export interface DocMeta {
  label: string;
  zh: string;
  abbr: string;
  tint: string; // badge background tint
  fg: string; // badge text
}

/** Per-invoice document types (one set per Invoice). */
export const INVOICE_DOC_TYPES = ['commercial_invoice', 'packing_list'] as const;

/** File-level common doc types (shared across the whole clearance). */
export const COMMON_FILE_DOCS = [
  'proforma_invoice',
  'purchase_order',
  'certificate_of_origin',
  'insurance_copy',
  'payment_proof',
  'freight_invoice',
  'bank_letter',
] as const;

/** File-level customs doc types. */
export const CUSTOMS_DOCS = [
  'bill_of_entry',
  'duty_challan',
  'assessment_copy',
  'out_of_charge',
  'delivery_order',
] as const;

export const DOC_META: Record<string, DocMeta> = {
  commercial_invoice: { label: 'Commercial Invoice', zh: '商业发票', abbr: 'CI', tint: '#DBEAFE', fg: '#1E40AF' },
  packing_list: { label: 'Packing List', zh: '装箱单', abbr: 'PL', tint: '#DBEAFE', fg: '#1E40AF' },
  proforma_invoice: { label: 'Proforma Invoice', zh: '形式发票', abbr: 'PI', tint: '#DBEAFE', fg: '#1E40AF' },
  purchase_order: { label: 'Purchase Order', zh: '采购订单', abbr: 'PO', tint: '#DBEAFE', fg: '#1E40AF' },
  bill_of_lading: { label: 'Bill of Lading', zh: '提单', abbr: 'BL', tint: '#E0E7FF', fg: '#3730A3' },
  awb: { label: 'Airway Bill', zh: '空运提单', abbr: 'AWB', tint: '#E0E7FF', fg: '#3730A3' },
  freight_invoice: { label: 'Freight Invoice', zh: '运费发票', abbr: 'FRT', tint: '#E0E7FF', fg: '#3730A3' },
  certificate_of_origin: { label: 'Certificate of Origin', zh: '原产地证书', abbr: 'CoO', tint: '#CCFBF1', fg: '#0F766E' },
  insurance_copy: { label: 'Insurance Copy', zh: '保险单', abbr: 'INS', tint: '#CCFBF1', fg: '#0F766E' },
  coa: { label: 'Certificate of Analysis', zh: '分析证书', abbr: 'CoA', tint: '#CCFBF1', fg: '#0F766E' },
  payment_proof: { label: 'Payment Proof', zh: '付款凭证', abbr: 'PAY', tint: '#DCFCE7', fg: '#166534' },
  bank_letter: { label: 'Bank Letter', zh: '银行函', abbr: 'BNK', tint: '#DCFCE7', fg: '#166534' },
  bill_of_entry: { label: 'Bill of Entry', zh: '进口报关单', abbr: 'BOE', tint: '#FEF3C7', fg: '#92400E' },
  duty_challan: { label: 'Duty Challan', zh: '关税缴款单', abbr: 'DTY', tint: '#FEF3C7', fg: '#92400E' },
  assessment_copy: { label: 'Assessment Copy', zh: '评估单', abbr: 'ASM', tint: '#FEF3C7', fg: '#92400E' },
  out_of_charge: { label: 'Out of Charge', zh: '放行单', abbr: 'OOC', tint: '#FEF3C7', fg: '#92400E' },
  delivery_order: { label: 'Delivery Order', zh: '提货单', abbr: 'DO', tint: '#FEF3C7', fg: '#92400E' },
};

export const docLabel = (type: string): string => DOC_META[type]?.label ?? type;
export const docZh = (type: string): string => DOC_META[type]?.zh ?? type;
export const docAbbr = (type: string): string => DOC_META[type]?.abbr ?? type.slice(0, 3).toUpperCase();

// ── File status / priority meta ───────────────────────────────────────

export const statusMeta: Record<FileStatus, Tint> = {
  draft: { label: 'Draft', bg: '#EEF2F7', fg: '#475569' },
  documents_pending: { label: 'Docs Pending', bg: '#FEF3C7', fg: '#92400E' },
  bank_work: { label: 'Bank Work', bg: '#DBEAFE', fg: '#1E40AF' },
  cha_work: { label: 'CHA Work', bg: '#E0E7FF', fg: '#3730A3' },
  duty_paid: { label: 'Duty Paid', bg: '#CCFBF1', fg: '#0F766E' },
  goods_received: { label: 'Goods Received', bg: '#DCFCE7', fg: '#166534' },
  closed: { label: 'Closed', bg: '#0A1F3D', fg: '#FFFFFF' },
};

export const prioMeta: Record<Exclude<Priority, 'normal'>, Tint> = {
  high: { label: 'High', bg: '#FEF3C7', fg: '#92400E' },
  urgent: { label: 'Urgent', bg: '#FEE2E2', fg: '#991B1B' },
};

export const docStatusMeta: Record<DocStatus, Tint> = {
  missing: { label: 'Missing', bg: '#FEF3C7', fg: '#92400E' },
  uploaded: { label: 'Uploaded', bg: '#DBEAFE', fg: '#1E40AF' },
  under_review: { label: 'Under Review', bg: '#FEF3C7', fg: '#92400E' },
  approved: { label: 'Approved', bg: '#DCFCE7', fg: '#166534' },
  discrepant: { label: 'Discrepant', bg: '#FEE2E2', fg: '#991B1B' },
  corrected: { label: 'Corrected', bg: '#CCFBF1', fg: '#0F766E' },
};

export const payStatusMeta: Record<PayStatus, Tint> = {
  pending: { label: 'Pending', bg: '#FEF3C7', fg: '#92400E' },
  part_paid: { label: 'Part Paid', bg: '#DBEAFE', fg: '#1E40AF' },
  paid: { label: 'Paid', bg: '#DCFCE7', fg: '#166534' },
  overdue: { label: 'Overdue', bg: '#FEE2E2', fg: '#991B1B' },
};

export const chaStepMeta: Record<ChaStepStatus, Tint> = {
  pending: { label: 'Pending', bg: '#FEF3C7', fg: '#92400E' },
  done: { label: 'Done', bg: '#DCFCE7', fg: '#166534' },
  na: { label: 'N/A', bg: '#EEF2F7', fg: '#64748B' },
};

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  advance: 'Advance to Supplier',
  balance: 'Balance to Supplier',
  freight: 'Freight',
  insurance: 'Insurance',
  duty: 'Customs Duty',
  cha_charges: 'CHA Charges',
  bank_charges: 'Bank Charges',
  other: 'Other',
};

// ── Stepper order ─────────────────────────────────────────────────────

export const STATUS_ORDER: FileStatus[] = [
  'draft',
  'documents_pending',
  'bank_work',
  'cha_work',
  'duty_paid',
  'goods_received',
  'closed',
];

export const STEP_LABELS: Record<FileStatus, string> = {
  draft: 'New',
  documents_pending: 'Docs',
  bank_work: 'Bank',
  cha_work: 'CHA',
  duty_paid: 'Duty',
  goods_received: 'Received',
  closed: 'Closed',
};

// ── CHA workflow (9 steps; keys are stable, used by deriveStatus) ─────

export interface ChaStepDef {
  key: string;
  label: string;
}

export const CHA_STEPS: ChaStepDef[] = [
  { key: 'documents_received', label: 'Documents received' },
  { key: 'igm_filed', label: 'IGM / manifest filed' },
  { key: 'boe_filed', label: 'Bill of Entry filed' },
  { key: 'assessment', label: 'Assessment done' },
  { key: 'duty_paid', label: 'Duty paid' },
  { key: 'examination', label: 'Examination' },
  { key: 'out_of_charge', label: 'Out of Charge (OOC)' },
  { key: 'delivery_order', label: 'Delivery Order (DO)' },
  { key: 'goods_delivered', label: 'Goods delivered' },
];

// Structured correction reasons (zh + en), used in the discrepancy flow.
export const CORRECTION_REASONS: { zh: string; en: string }[] = [
  { zh: '金额不符', en: 'Amount mismatch' },
  { zh: '发票号不符', en: 'Invoice number mismatch' },
  { zh: '提单号不符', en: 'BL number mismatch' },
  { zh: '币种不符', en: 'Currency mismatch' },
  { zh: '供应商名称不符', en: 'Supplier name mismatch' },
  { zh: '缺少盖章', en: 'Missing stamp' },
  { zh: '缺少签字', en: 'Missing signature' },
  { zh: '收货人错误', en: 'Wrong consignee' },
  { zh: '其他', en: 'Other' },
];
