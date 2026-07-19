# Export Desk — Phase 1 implementation plan

**Spec:** `docs/superpowers/specs/2026-07-11-export-desk-phase1-design.md` (authoritative — read it first)
**Branch:** work off a feature branch (`git checkout -b feat/export-desk-phase1`), not `main`.

## Goal
Ship a parallel **Export Desk** (India → overseas buyer, outbound) mirroring Import
Desk: export types + a pure live derive engine + a file-list screen + a file-detail
screen, reachable from one sidebar link. Dummy-seeded, in-memory + IndexedDB, no
backend. Zero regression to the live Import subsystem.

## Architecture
Approach A — **separate parallel module**. Export gets its own types, `deriveExport.ts`,
`exportStore.tsx`, `exportSeed.ts`, and screens. It reuses only UI atoms (`Modal`,
`Overlay`, `Button`, `Badge`, `DocumentChecklist`), shared enums (`DocStatus`,
`PayStatus`, `Priority`, `Mode`, `Incoterm`, `Currency`, `Doc`, `Note`), `RolePolicy`,
`mkDoc`, `cx`. It does **not** touch `derive.ts`, `store.tsx`, or the import seed.

## Tech stack
React 18 + TS strict, Vite, Tailwind 3.4, React Router 6, vitest, lucide-react. No new deps.

## Global constraints
- **Never edit** `app/src/lib/derive.ts`, `app/src/store/store.tsx`, or `app/src/data/seed.ts`.
  The 91 import tests must stay green untouched.
- **Additive only** in shared files (`types/index.ts`, `docs.ts`, `checklist.ts`,
  `format.ts`, `nav.ts`, `App.tsx`, `main.tsx`): append new exports, do not modify existing.
- **§0 financial gating** preserved: Payments tab, invoice value/FX, HSN behind
  `RolePolicy.canSeeFinancials` / `canSeeHsn`.
- Every ladder rung in `deriveExport.ts` names its exact trigger field (per spec).
- TDD: write the failing test, then the code, per task. Verify each task before commit.
- Final gate: `npx tsc --noEmit` clean · `npx vitest run` (~100+, up from 91) · `npm run build` clean.
- Commit only when the user asks. Each task below ends with a *suggested* commit.

---

## Task 1 — Export data model + derive engine (pure TDD core)

The load-bearing slice. No React, no store. Write `deriveExport.test.ts` first.

### 1a. Shared enums + export types → `app/src/types/index.ts` (append at end)
Copy the type block verbatim from spec §"Data model" (lines 49–129):
`ExportFileStatus`, `PayDirection`, `ExportPaymentType`, `ExportPayment`,
`ExportInvoice`, `ExportFile`. Reuse existing `DocStatus`, `PayStatus`, `Priority`,
`Mode`, `Incoterm`, `Currency`, `Doc`, `Note` — do **not** redefine them.

### 1b. Export doc meta → `app/src/lib/docs.ts` (append)
Add alongside the import tables (do not edit existing consts):

```ts
export const EXPORT_INVOICE_DOC_TYPES = [
  'export_commercial_invoice', 'export_packing_list',
] as const;

export const EXPORT_COMMON_FILE_DOCS = [
  'lut_bond', 'certificate_of_origin', 'insurance_copy',
] as const;

export const EXPORT_CUSTOMS_DOCS = [
  'shipping_bill', 'bill_of_lading', 'awb', 'firc_brc',
] as const;
```

Add `DOC_META` entries for the NEW types only (`certificate_of_origin`,
`insurance_copy`, `bill_of_lading`, `awb` already exist — reuse them, don't duplicate):
```ts
// merge into DOC_META:
export_commercial_invoice: { label: 'Export Commercial Invoice', zh: '出口商业发票', abbr: 'CI', tint: '#DBEAFE', fg: '#1E40AF' },
export_packing_list: { label: 'Export Packing List', zh: '出口装箱单', abbr: 'PL', tint: '#DBEAFE', fg: '#1E40AF' },
lut_bond: { label: 'LUT / Bond', zh: 'LUT/保函', abbr: 'LUT', tint: '#DCFCE7', fg: '#166534' },
shipping_bill: { label: 'Shipping Bill', zh: '出口报关单', abbr: 'SB', tint: '#FEF3C7', fg: '#92400E' },
firc_brc: { label: 'FIRC / BRC', zh: '外汇实现证明', abbr: 'FIRC', tint: '#FEF3C7', fg: '#92400E' },
```

Add status + payment-label meta:
```ts
export const exportStatusMeta: Record<ExportFileStatus, Tint> = {
  draft: { label: 'Draft', bg: '#EEF2F7', fg: '#475569' },
  documents_pending: { label: 'Docs Pending', bg: '#FEF3C7', fg: '#92400E' },
  cha_work: { label: 'Shipping Bill', bg: '#E0E7FF', fg: '#3730A3' },
  customs_cleared: { label: 'Customs Cleared', bg: '#DBEAFE', fg: '#1E40AF' },
  shipped: { label: 'Shipped', bg: '#CCFBF1', fg: '#0F766E' },
  payment_realized: { label: 'Payment Realized', bg: '#DCFCE7', fg: '#166534' },
  closed: { label: 'Closed', bg: '#F1F5F9', fg: '#64748B' },
};

export const EXPORT_PAYMENT_LABELS: Record<ExportPaymentType, string> = {
  advance_received: 'Advance received', balance_received: 'Balance received',
  freight: 'Freight', insurance: 'Insurance', cha_charges: 'CHA charges',
  bank_charges: 'Bank charges', other: 'Other',
};
```
Reuse `docStatusMeta`, `payStatusMeta`, `prioMeta` unchanged. Import the new types
into docs.ts's type import block.

### 1c. Builders → export `mkDoc` from `checklist.ts`; new `app/src/lib/exportChecklist.ts`
- In `checklist.ts`: `mkDoc` is already exported — confirm, no change needed.
- New `exportChecklist.ts`:
```ts
import type { Doc, ExportInvoice, Incoterm, Mode } from '../types';
import { isRequiredExport } from './deriveExport';
import { mkDoc } from './checklist';
import { APPROX_INR_RATE } from './format';

const exportFileDocOrder = (mode: Mode): string[] => [
  'lut_bond', 'certificate_of_origin', 'insurance_copy',
  mode === 'air' ? 'awb' : 'bill_of_lading',
  'shipping_bill', 'firc_brc',
];

export function mkExportChecklist(mode: Mode, incoterm: Incoterm): Doc[] {
  return exportFileDocOrder(mode).map((t) => mkDoc(t, 'missing', isRequiredExport(t, { mode, incoterm })));
}

// mkExportInvoice(draft) — mirror mkInvoice, with export_commercial_invoice + export_packing_list slots.
```
(Full `mkExportInvoice` mirrors `mkInvoice` in `checklist.ts`, swapping `buyer` for
`supplier` and the two doc types.)

### 1d. Derive engine → `app/src/lib/deriveExport.ts`
Implement per spec §"Derive engine" (lines 155–223) exactly. Functions:
`allDocsExport`, `gateDocsExport`, `reqMissingExport`, `isRequiredExport`,
`anyGateUploadedExport`, `gateDiscrepantExport`, `realized`, `blApproved`,
`shippingBillApproved`, `deriveExportStatus`, `derivePriorityExport`,
`responsibleExportOf`, `exportFileAlerts`, `allExportAlerts`.

Ladder order is load-bearing (most-advanced-first):
```
statusManual → status
realized(f) → payment_realized          (>=1 receivable AND every receivable paid)
blApproved(f) → shipped                 (tested BEFORE customs_cleared — ordering guard)
shippingBillApproved(f) → customs_cleared
!anyGateUploaded(f) → draft
reqMissing(f)>0 || gateDiscrepant(f) → documents_pending
else → cha_work
```
Payables never gate. `realized` uses `direction==='receivable'`.

### 1e. Seed → `app/src/data/exportSeed.ts`
`EXPORT_SEED_FILES: ExportFile[]` — one file per rung: `draft`,
`documents_pending` (incl. one discrepant-CI variant), `cha_work`, `customs_cleared`,
`shipped`, `payment_realized`, plus one multi-invoice file. Reuse `USERS` names.
Build docs via `mkExportChecklist`, invoices via `mkExportInvoice`, then mutate
statuses to land each file on its target rung.

### 1f. TEST FIRST → `app/src/test/deriveExport.test.ts`
Mirror `derive.test.ts`. Assertions per spec §"Testing plan" (lines 263–280):
- each seed file → its intended `ExportFileStatus` (all 7 rungs);
- `statusManual` short-circuits to `closed`;
- **REGRESSION:** `blApproved` + `shippingBillApproved` → `shipped`, not `customs_cleared`;
- `isRequiredExport` matrix: `insurance_copy` only under CIF; `awb` vs `bill_of_lading`
  by mode; `certificate_of_origin` always optional;
- `realized`: not realized while any receivable pending; realized when all paid;
  zero-receivable file is NOT `payment_realized`;
- payables don't gate: pending `freight` payable on a `cha_work` file → still `cha_work`.

**Verify:** `cd app && npx vitest run src/test/deriveExport.test.ts` green ·
`npx vitest run` still ≥91 green · `npx tsc --noEmit` clean.
**Commit (suggested):** `feat(export): data model + live derive engine (Phase 1 core)`

---

## Task 2 — Export store

### 2a. `app/src/lib/format.ts` (append) — export helpers
`exportValueInr(f: ExportFile)`, `buyerLabel(f: ExportFile)`,
`distinctBuyers(f)`, mirroring `fileValueInr`/`supplierLabel`/`distinctSuppliers`.
Reuse `payInr`, `fxLine`, `inr`, `APPROX_INR_RATE` unchanged.

### 2b. `app/src/store/exportStore.tsx`
Own React context. Mirror `store.tsx` **minus all sync/remote** (`runSyncPlan`,
`reconcileBaseline`, server calls). Shape:
```ts
{ role, files: ExportFile[], toast, addFile, patchFile, deleteFile,
  addPayment(fileId, p), setDocStatus(...), addNote(...), setToast }
```
- Seed from `EXPORT_SEED_FILES`; hydrate/persist via `idbGet`/`idbSet` key
  `'export-desk-files'`.
- Accept `initialFiles?: ExportFile[]` prop (for render test, mirroring `StoreProvider`).
- Immutable `patchFile`. `addPayment` mirrors import's, but sets `direction` from the
  payment type (receivable for advance/balance_received, else payable) and reuses
  `APPROX_INR_RATE` for non-INR.
- `useExportStore()` hook.

### 2c. Wire provider → `app/src/main.tsx`
Wrap alongside `StoreProvider`:
```tsx
<StoreProvider>
  <ExportStoreProvider>
    <App />
  </ExportStoreProvider>
</StoreProvider>
```
**Verify:** `npx tsc --noEmit` clean · `npx vitest run` still green.
**Commit (suggested):** `feat(export): in-memory + IDB store, wired into app`

---

## Task 3 — Export screens + routes + nav

### 3a. `app/src/components/ExportFileCard.tsx`
Mirror `ImportFileCard`, `ExportFile`-typed. Shows `deriveExportStatus` badge (via
`exportStatusMeta`), `buyerLabel`, `destination`, `exportValueInr` (behind
`showInr`), responsible party via `responsibleExportOf`. `onClick`, optional `onDelete`.

### 3b. `app/src/screens/ExportFilesList.tsx`
Mirror `FilesList` (SearchBar + FilterTabs + card grid + delete Modal). Tabs map to
export ladder: All / Docs (`draft`|`documents_pending`) / Shipping Bill (`cha_work`) /
Customs (`customs_cleared`|`shipped`) / Payment (`payment_realized`|`closed`) / Urgent.
Uses `useExportStore`, `deriveExportStatus`, `derivePriorityExport`, `buyerLabel`.
`TopBar title="Export files"`. Nav to `/exports/:id`.

### 3c. `app/src/screens/ExportFileDetail.tsx`
Mirror `FileDetail`, trimmed tabs: **Summary**, **Documents**, **Payments**, **Notes**.
- Documents: reuse `DocumentChecklist` (doc-type-agnostic — confirm it takes
  `groups: DocGroup[]`). Build groups from `allDocsExport` split file/invoice/customs.
- Payments: **financial-gated** via `RolePolicy.canSeeFinancials(role)`. Two labelled
  groups — **Receivables** and **Payables** — summed separately (never summed together).
  Reuse `AddPaymentModal` pattern; export payment types via `EXPORT_PAYMENT_LABELS`.
- Verify `FilePreviewModal` accepts the export `Doc` (it's doc-type-string based).
  If it hard-references import-only fields, fork a minimal `ExportFilePreviewModal`.
- HSN / invoice value behind `canSeeHsn` / `canSeeFinancials`.
- One primary action; answers what / pending / who.

### 3d. Routes → `app/src/App.tsx` (append inside authed layout)
```tsx
<Route path="/exports" element={<ExportFilesList />} />
<Route path="/exports/:id" element={<ExportFileDetail />} />
```
Import the two screens at top.

### 3e. Nav link → `app/src/lib/nav.ts` (append to NAV, after `files`)
```ts
{ key: 'exports', label: 'Exports', path: '/exports', roles: ALL, badge: null },
```

### 3f. Render test → `app/src/test/exportRender.test.tsx`
Mirror `render.test.tsx`: `renderToStaticMarkup` of `ExportFilesList` and
`ExportFileDetail` inside `<MemoryRouter><ExportStoreProvider initialFiles={EXPORT_SEED_FILES}>`
— assert no throw, key strings present (buyer, status label).

**Verify (final gate):**
`cd app && npx tsc --noEmit` clean · `npx vitest run` (~100+, up from 91, all green) ·
`npm run build` clean · manual: `npm run dev`, click **Exports** in sidebar, open a file,
check Documents/Payments tabs, confirm role switcher hides Payments for Import Manager.
**Commit (suggested):** `feat(export): file-list + file-detail screens, route + nav link`

---

## Self-review checklist (run against spec before declaring done)
- [ ] `derive.ts` / `store.tsx` / import `seed.ts` untouched (`git diff` shows no import-domain edits).
- [ ] 91 import tests still green; new deriveExport tests cover all 7 rungs + ordering guard + payables-don't-gate.
- [ ] Ladder tests `shipped` BEFORE `customs_cleared` (the dead-code guard).
- [ ] `realized` needs ≥1 receivable AND all receivables paid; zero-receivable ≠ realized.
- [ ] `isRequiredExport`: insurance CIF-only, awb/bl by mode, CoO optional.
- [ ] Payments tab + value/FX/HSN gated by RolePolicy (Import Manager sees no financials).
- [ ] Receivables and payables never summed together.
- [ ] One sidebar link ships; `/exports` + `/exports/:id` routed inside authed layout.
- [ ] tsc + vitest + build all clean.
- [ ] Nothing from the "OUT of Phase 1" list (CHA desk, portal, AI scan, backend) was built.
