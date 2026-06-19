# Skill: import documents & status derivation

Reference for the document checklist, required-doc rules, and how a file's status is derived.

## Document types
- **Per-invoice** (live on each `Invoice`): `commercial_invoice` (CI), `packing_list` (PL).
- **File-level common**: `proforma_invoice`, `purchase_order`, `certificate_of_origin`,
  `bill_of_lading` (sea) / `awb` (air), `insurance_copy`, `payment_proof`, `freight_invoice`,
  `bank_letter`.
- **Customs outputs** (produced during CHA work): `bill_of_entry`, `duty_challan`,
  `assessment_copy`, `out_of_charge`, `delivery_order`.
- **External-only extra**: `coa` (Certificate of Analysis) — appears on the supplier magic page
  only; not an internal checklist doc.

## Required rules (`isRequired`, `app/src/lib/derive.ts`)
- `certificate_of_origin`, `bank_letter` → optional.
- `insurance_copy` → not required under **CIF**.
- `freight_invoice` → not required under **CIF / CFR**.
- `bill_of_lading` for sea, `awb` for air.
- `commercial_invoice` / `packing_list` → always required, per invoice.

## Status ladder (`deriveStatus`)
Most-advanced-first; gate-doc based (customs outputs do NOT block documents→cha_work):
```
statusManual -> held status (e.g. closed)
doDone && ooc -> goods_received
dutyPaid -> duty_paid
!anyGateUploaded -> draft
gateMissing>0 || gateDiscrepant -> documents_pending
payPending(advance/balance) -> bank_work
else -> cha_work
```

## Discrepancy loop
`flagDoc` (→ discrepant, with a structured zh reason from `CORRECTION_REASONS`) →
`requestCorrection` (notify supplier) → `reuploadDoc` (→ under_review) → `approveDoc` (→ approved).
Approve is gated to Accountant/Owner via `RolePolicy.canApproveDoc`.

## CHA workflow
9 ordered steps in `CHA_STEPS`. `out_of_charge` and `delivery_order` are read by `deriveStatus`
(OOC + DO done ⇒ goods_received). Steps cycle `pending → done → na`.
