# Import Desk — Favourite Fab Import Control Tower

Mobile-first React app to track India imports (INR, FY Apr–Mar, GST/IGST). One place
that answers, per shipment: **what import is this, what is pending, who is responsible**.
Status is **derived live**, never hand-set.

## Phase A (this build) vs Phase B
- **Phase A** = the `app/` frontend on dummy data seeded to the real schema shape. All 11
  screens, live derive engine, magic-link portal, multi-invoice model. No backend, no auth,
  no real uploads. Role is chosen by the TopBar switcher (OAuth stand-in).
- **Phase B** = wire `api/` (Fastify) + MySQL (`db/schema.sql`), Google OAuth, signed/
  revocable magic tokens, `StorageService` + real file picker. The route stubs return 501.

## Run
```
cd app && npm install && npm run dev   # http://localhost:5173
cd app && npm test                     # derive + alerts + render (vitest)
cd app && npm run build                # tsc --strict + vite build
```
`scripts/setup.sh` installs app + api and (optionally) loads the schema.

## Architecture
- **`app/src/lib/derive.ts`** is load-bearing & pure: `deriveStatus`, `derivePriority`,
  `isRequired`, `relevantPayments`, `allAlerts`, `responsibleOf`. Unit-tested.
- **`app/src/store/store.tsx`** — React context holding `{role, files, toast}` + all
  mutations. Screens read `deriveStatus(file)` on render, so the UI recomputes live.
- **`app/src/data/seed.ts`** — 7 files covering every status branch; file 5 carries 2
  invoices from 2 suppliers.

## Data model — multi-invoice native
A file = one BL / one customs clearance carrying **`invoices: Invoice[]` (≥1)**. Supplier,
value, and the commercial-invoice + packing-list live on each `Invoice` — `ImportFile` has
**no** top-level `supplier`/`usd` mirror. Read worth via `fileValueInr(f)`, vendor via
`supplierLabel(f)`. `allDocs(f)` = file docs + every invoice's CI/PL.

## deriveStatus ladder (most-advanced-first; gate-doc based)
```
statusManual            -> held status (e.g. 'closed')
doDone && ooc           -> goods_received     # BEFORE duty_paid, else dead code
dutyPaid                -> duty_paid
!anyGateUploaded        -> draft
gateMissing>0 || disc   -> documents_pending
payPending(adv/bal)     -> bank_work
else                    -> cha_work
```
**Gate docs** = required docs the supplier/forwarder provides pre-customs. Customs outputs
(BOE, challan, assessment, OOC, DO) are produced *during* CHA work, so they don't block the
documents→cha_work transition — they're tracked in the CHA tab.

## Required-doc rules (`isRequired`)
- `certificate_of_origin`, `bank_letter` → optional.
- `insurance_copy` → not required under **CIF**. `freight_invoice` → not required under **CIF/CFR**.
- `bill_of_lading` (sea) / `awb` (air) by mode. `commercial_invoice`/`packing_list` always required (per invoice).
- `relevantPayments` mirrors this: CIF drops insurance+freight cards, CFR drops freight.

## §0 hard rules (enforced)
- **Financials are role-gated** via `lib/rolePolicy.ts`: invoice value/FX, Payments tab, duty,
  **HSN**, landed cost, and **Approve** are visible only to Accountant + Owner/Admin. Import
  Manager and every external party never see a financial field.
- **`canMarkClosed` = Admin/Owner only** (owner closes).
- **External = separate tokenized routes, no nav, no party toggle:** `/u/:fileNumber/fwd/:token`
  and `/u/:fileNumber/cha/:token`. zh-CN default for CN parties; CHA link always English.
- **Create ≤3 typed fields** on the template path (invoice no, amount, ETA). Blank wizard is advanced.
- Every per-file screen answers what/pending/who and has exactly one primary action.

## Alerts (`allAlerts`)
Six kinds, sorted `demurrage → eta → approval_required → discrepant → overdue → missing`.
Dashboard shows `slice(0,2)`; nav badge = count. Other §13 alert types surface via dedicated
screens (PendingDocs, PendingPayments, ChaDesk) in Phase A.

## i18n
External surface only (`app/src/i18n/`). Internal app is English. Bilingual doc labels +
structured zh correction reasons (`CORRECTION_REASONS` in `lib/docs.ts`). utf8mb4 throughout.

## Conventions
- Tailwind 3.4 tokens in `tailwind.config.ts`; status/doc tints are data in `lib/docs.ts`
  (consumed as inline style), not Tailwind classes.
- React Router 6. `useIsMobile()` (880px) swaps Sidebar ↔ MobileBottomNav.
- No `package.json` at the project root — `app/` and `api/` are independent.
