# Export Desk — Phase 1 design

## Goal
Give the team a parallel "Export Desk" to maintain **outbound** (India → overseas
buyer) shipment documents, invoices, and payments — the mirror of Import Desk.
Phase 1 = the thin vertical slice: data model + live derive engine + a file-list
screen + a file-detail screen (documents / invoices / payments). Reachable from
the sidebar.

## Approach — separate parallel module (Approach A, user-approved)
Export gets its **own** types, derive engine, store, seed, and screens. It reuses
only the true UI atoms (`Modal`, `Overlay/SlideOver`, `Button`, `Badge`, the
doc-status tint-as-data pattern, `cx`, formatters). It does **not** share the
Import domain types or `derive.ts`.

**Why:** this is a live production app. `app/src/lib/derive.ts` is explicitly
load-bearing for Import (91 passing tests gate it). A unified `direction` flag
through shared types + derive would tangle two genuinely-different status
ladders / doc rules / payment semantics into the exact conditional soup we want
to avoid, and any bug there regresses live Import. Isolation costs duplication
but buys zero-regression safety; Phase-1 scope discipline is the mitigation for
the duplication.

## Store decision (was the open question — now pinned)
New **`app/src/store/exportStore.tsx`** — its own React context, **seeded +
in-memory + IndexedDB persistence only, NO server sync in Phase 1**. This is
exactly how the Import store existed before its Phase-B wiring. Extending the
existing `store.tsx` (heavy with `runSyncPlan`/`reconcileBaseline`/IDB tied to
`ImportFile`) would re-entangle the two subsystems and reintroduce the
regression risk Approach A exists to avoid.

- IDB key: `export-desk-files` (import uses its own key — no collision).
- `ExportStoreProvider` wraps the app alongside `StoreProvider` in `App.tsx`.
- Mutations mirror the import store's shape (immutable `patchFile`), minus all
  sync/remote calls. Screens read `deriveExportStatus(file)` on render → live
  recompute, same contract as import.

## Reachability (Phase 1 ships a nav link, not URL-only)
Add **one** sidebar entry to `lib/nav.ts`: `{ key: 'exports', label: 'Exports',
path: '/exports', roles: ALL, badge: null }`. A route with no nav entry means the
user types a URL every time — the feature would be effectively unshipped, which
fails the "maintain the export documents" ask. This one link is orthogonal to
the deferred nav-diet work (Phase 2+).

## Data model — `app/src/types/index.ts` (new export types, additive)
Mirror the import shapes; reuse shared enums (`DocStatus`, `PayStatus`,
`Priority`, `Mode`, `Incoterm`, `Currency`, `Doc`, `Note`) as-is.

```ts
export type ExportFileStatus =
  | 'draft'
  | 'documents_pending'
  | 'cha_work'          // shipping bill being filed
  | 'customs_cleared'   // shipping bill approved / LEO granted
  | 'shipped'           // export BL/AWB obtained
  | 'payment_realized'  // buyer remittance realized (FIRC/BRC)
  | 'closed';

export type PayDirection = 'receivable' | 'payable';

export type ExportPaymentType =
  | 'advance_received'  // receivable — buyer advance
  | 'balance_received'  // receivable — buyer balance
  | 'freight'           // payable — to forwarder (CIF/CFR)
  | 'insurance'         // payable
  | 'cha_charges'       // payable
  | 'bank_charges'      // payable
  | 'other';            // payable

export interface ExportPayment {
  type: ExportPaymentType;
  direction: PayDirection;   // keeps receivables & payables from summing together
  currency?: Currency;
  usd?: number;
  rate?: number;
  inr?: number;
  due: string;
  paid: string | null;
  status: PayStatus;
  ref: string;
}

// One export invoice line issued by us to the overseas buyer.
export interface ExportInvoice {
  id: string;
  buyer: string;             // overseas buyer (mirror of import Invoice.supplier)
  invoiceNumber: string;
  invoiceDate: string;
  product: string;
  qty: string;
  weight?: string;
  hsn?: string;
  usd: number;
  currency: Currency;
  rate: number;
  ci: Doc;                   // export_commercial_invoice for THIS line
  pl: Doc;                   // export_packing_list for THIS line
}

export interface ExportFile {
  id: number;
  fileNumber: string;
  destination: string;       // buyer country (mirror of import `country` origin)
  mode: Mode;
  incoterm: Incoterm;
  invoices: ExportInvoice[]; // >= 1
  blAwb: string;
  portLoading: string;       // Indian port of loading
  portDischarge: string;     // overseas port
  etd?: string;
  eta: string;
  etaDays: number;
  shippedOn: string | null;  // actual export/sailing date
  shippingLine: string;
  forwarder: string;
  shippingBillNo: string | null;
  shippingBillDate: string | null;
  manager: string;           // export manager
  accountant: string;
  cha: string;
  status: ExportFileStatus;  // seeded fallback; deriveExportStatus is authoritative
  statusManual?: boolean;    // owner override holds `status` (e.g. terminal 'closed')
  priority: Priority;
  discrepancy?: string;
  docs: Doc[];               // file-level docs only — NEVER export CI / PL
  payments: ExportPayment[];
  notes: Note[];
}
```
No `duty`, `chaOv`, `boeNumber`, tracking fields, or `containerNo` in Phase 1
(those are Import-specific or deferred).

## Document types — `app/src/lib/docs.ts` (additive tables)
Add export doc meta + type-group tables alongside the import ones. Doc set is
exactly the user-approved list:

Per-invoice (one set per `ExportInvoice`):
- `export_commercial_invoice` (CI), `export_packing_list` (PL)

File-level **gate** docs (exporter provides, pre-customs):
- `lut_bond` (LUT / Bond — zero-rated GST), `certificate_of_origin` (optional),
  `insurance_copy` (only under CIF)

File-level **customs / post** docs (produced during/after customs — excluded
from gate, like import's BOE/OOC):
- `shipping_bill` (customs export doc + LEO), `bill_of_lading` / `awb` (by mode),
  `firc_brc` (Foreign Inward Remittance Cert / Bank Realization Cert)

New constants: `EXPORT_INVOICE_DOC_TYPES`, `EXPORT_COMMON_FILE_DOCS`,
`EXPORT_CUSTOMS_DOCS`, entries in `DOC_META` (label/zh/abbr/tint/fg for each new
type), and `exportStatusMeta: Record<ExportFileStatus, Tint>` +
`EXPORT_PAYMENT_LABELS: Record<ExportPaymentType, string>`. Reuse `docStatusMeta`,
`payStatusMeta`, `prioMeta` unchanged.

## Derive engine — new `app/src/lib/deriveExport.ts` (pure, load-bearing)
Mirror `derive.ts`. **Every ladder rung names the exact field(s) that trigger
it** (the discipline that makes import's ladder correct):

```
allDocs(f)      = [...f.docs, ...f.invoices.flatMap(i => [i.ci, i.pl])]
EXPORT_CUSTOMS  = Set('shipping_bill','bill_of_lading','awb','firc_brc')
gateDocs(f)     = required docs NOT in EXPORT_CUSTOMS
```

Required-doc rules — `isRequiredExport(type, {mode, incoterm})`:
- `export_commercial_invoice`, `export_packing_list` → true (per invoice)
- `lut_bond` → true
- `certificate_of_origin` → false (optional)
- `insurance_copy` → `incoterm === 'CIF'` (we bear insurance only when selling CIF)
- `bill_of_lading` → `mode === 'sea'`; `awb` → `mode === 'air'`
- `shipping_bill` → true; `firc_brc` → true
- default → true

Ladder (`deriveExportStatus`, most-advanced-first — each rung's trigger field
named):

```
1. f.statusManual                         -> f.status            // owner hold (e.g. 'closed')
2. realized(f)                            -> payment_realized
      realized = f.payments has >=1 receivable AND every receivable row.status==='paid'
      (receivable = direction==='receivable', i.e. advance_received/balance_received)
3. blApproved(f)                          -> shipped             // tested BEFORE customs_cleared
      blApproved = the export BL (sea) or AWB (air) doc.status==='approved'
      (a BL/AWB can only exist after LEO, so shipped implies customs_cleared —
       same reason import tests goods_received before duty_paid)
4. shippingBillApproved(f)                -> customs_cleared
      shippingBillApproved = the shipping_bill doc.status==='approved'
5. !anyGateUploaded(f)                     -> draft              // no gate doc uploaded yet
6. reqMissing(f) > 0 || gateDiscrepant(f) -> documents_pending  // gate doc missing/discrepant
7. else                                    -> cha_work           // docs complete, shipping bill filing
```

**Payments gating decision (explicit, per the "state it or it's ambiguous"
rule):**
- **Receivables** (`advance_received`, `balance_received`) gate the terminal
  `payment_realized` rung (rung 2). Nothing else.
- **Payables** (`freight`, `insurance`, `cha_charges`, `bank_charges`, `other`)
  are **display-only in Phase 1** — tracked, shown, and summed on the Payments
  tab, but they do **not** gate any ladder state. (No fragile intermediate
  "vendor_work" invented; can be added in a later phase if the team wants it.)

`payment_realized` is gated on **payment status** (receivable rows paid), not on
the FIRC/BRC doc status — mirroring how import gates `duty_paid` on a paid duty
payment, not on the challan doc. The FIRC/BRC doc is the supporting evidence and
shows on the Documents tab, but the payment row is the source of truth.

Also port (straight mirrors): `derivePriorityExport` (urgent on any discrepant;
urgent on etaDays 0–3 with gate missing; else seeded). **No incoterm trimming of
payments in Phase 1** — payments display exactly as entered (no
`relevantPayments` analogue), since payables are real regardless of incoterm.
`responsibleExportOf`:
```
draft / documents_pending      -> [f.manager, 'Export Manager']
cha_work                       -> [f.cha, 'CHA']
customs_cleared / shipped      -> [f.forwarder, 'Forwarder']
payment_realized               -> [f.accountant, 'Accountant']
closed                         -> ['—', '']
```
Alerts (`exportFileAlerts` / `allExportAlerts`): Phase 1 ships the subset that
maps cleanly — `discrepant`, `overdue` (any payment overdue), `eta` (etaDays
0–3 with gate missing), `missing` (gate doc missing when etaDays ≤ 7). No
`demurrage` (import-specific) and no `approval_required` beyond what Documents
surfaces. Reuse the `Alert`/`AlertKind` shape.

## Builders — new `app/src/lib/exportChecklist.ts`
Mirror `checklist.ts`: `mkExportChecklist(mode, incoterm)` (file-level export
docs in display order), `mkExportInvoice(draft)` (builds an `ExportInvoice` with
`export_commercial_invoice` + `export_packing_list` doc slots). Reuse `mkDoc`
(export it from `checklist.ts` — it's doc-type agnostic).

## Seed — new `app/src/data/exportSeed.ts`
`EXPORT_SEED_FILES: ExportFile[]` — 5–6 files, each landing on a distinct ladder
rung (`draft`, `documents_pending` (incl. one via discrepant CI), `cha_work`,
`customs_cleared`, `shipped`, `payment_realized`) plus one multi-invoice file, so
the derive test can assert every branch. Reuse `USERS` for manager/accountant/
cha names.

## Screens
- **`app/src/screens/ExportFilesList.tsx`** — mirror of `FilesList`: card/row per
  export file, shows `deriveExportStatus` badge, buyer, destination, value,
  responsible party. Route `/exports`.
- **`app/src/screens/ExportFileDetail.tsx`** — mirror of `FileDetail`, trimmed to
  Phase-1 tabs: **Summary**, **Documents** (checklist via existing
  `DocumentChecklist` if type-compatible, else a thin export variant),
  **Payments** (financial-gated via `RolePolicy.canSeeFinancials`, receivables
  and payables shown in two labelled groups), **Notes**. Reuse
  `FilePreviewModal` for doc slide-over if it accepts the export `Doc` (it's
  doc-type-string based — verify; if it hard-references import-only fields, fork
  a minimal `ExportFilePreviewModal`). Route `/exports/:id`.

Financial gating (`§0`) is preserved: Payments tab + invoice value/FX/HSN behind
`RolePolicy.canSeeFinancials` / `canSeeHsn`, exactly as import.

## App wiring — `app/src/App.tsx`
Add routes inside the authed layout:
```
<Route path="/exports" element={<ExportFilesList />} />
<Route path="/exports/:id" element={<ExportFileDetail />} />
```
Wrap the tree with `<ExportStoreProvider>` (alongside the existing
`StoreProvider`).

## Testing plan (baseline must GROW past 91)
- **New `app/src/test/deriveExport.test.ts`** (mirror `derive.test.ts`):
  - each seed file resolves to its intended `ExportFileStatus` (all 7 rungs);
  - `statusManual` short-circuits to `closed`;
  - REGRESSION: `blApproved` + `shippingBillApproved` resolves to `shipped`, not
    `customs_cleared` (the ordering guard);
  - `isRequiredExport` matrix: `insurance_copy` required only under CIF; `awb`
    vs `bill_of_lading` by mode; `certificate_of_origin` always optional;
  - `realized` gating: not realized while any receivable is `pending`; realized
    when all receivables `paid`; a file with zero receivables is NOT
    `payment_realized`;
  - payables do NOT affect status (add a pending `freight` payable to a
    `cha_work` file → still `cha_work`).
- Existing 91 import tests stay green (no edits to `derive.ts`/`store.tsx`/
  import seed).
- Verify: `npx tsc --noEmit` clean · `npx vitest run` (expect ~100+, up from 91)
  · `npm run build` clean.

## Explicitly OUT of Phase 1 (no scaffolding, no hooks built early)
- CHA-desk equivalent for exports (shipping-bill step workflow / `chaOv`).
- External buyer / forwarder tokenized portal routes.
- Dashboard / Today / Calendar / Reports integration and nav-diet.
- AI extraction for export docs (Shipping Bill / FIRC amount scan).
- Backend `api/` + `db/schema.sql` export tables + server sync.
- Incoterm-based payment trimming, demurrage/approval alert parity.
Zero code for these ships in Phase 1.
