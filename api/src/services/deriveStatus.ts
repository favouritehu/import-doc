// Server-side status derivation. This MUST stay in lock-step with the frontend
// app/src/lib/derive.ts — the ladder and gate-doc rules are identical. Phase B
// computes status here too so the API never trusts a client-sent status, and
// enforces the financial/HSN field projection per role before responding.

export type FileStatus =
  | 'draft'
  | 'documents_pending'
  | 'bank_work'
  | 'cha_work'
  | 'duty_paid'
  | 'goods_received'
  | 'closed';

export interface DeriveInput {
  statusManual: boolean;
  status: FileStatus;
  gateMissing: number; // required gate docs missing/discrepant (excludes customs outputs)
  gateDiscrepant: boolean;
  anyGateUploaded: boolean;
  payPending: boolean;
  dutyPaid: boolean;
  ooc: boolean;
  doDone: boolean;
}

/** Mirror of deriveStatus() in the frontend — most-advanced-first, gate-doc based. */
export function deriveStatus(f: DeriveInput): FileStatus {
  if (f.statusManual) return f.status;
  if (f.doDone && f.ooc) return 'goods_received';
  if (f.dutyPaid) return 'duty_paid';
  if (!f.anyGateUploaded) return 'draft';
  if (f.gateMissing > 0 || f.gateDiscrepant) return 'documents_pending';
  if (f.payPending) return 'bank_work';
  return 'cha_work';
}
