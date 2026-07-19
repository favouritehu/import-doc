# Import Desk — Favourite Fab Import Control Tower
Mobile-first React app: track India imports(INR,FY Apr–Mar,GST/IGST). Per shipment: what/pending/who. Status derived live, never hand-set.

## Phase A (this build) vs Phase B
Phase A=`app/` frontend, dummy data/real schema: 11 screens, live derive engine, magic-link portal, multi-invoice model; no backend/auth/uploads; role=TopBar switcher(OAuth stand-in).
Phase B=`api/`(Fastify)+MySQL(`db/schema.sql`), Google OAuth, signed/revocable magic tokens, `StorageService`+file picker; route stubs=501.

## Run
```
cd app && npm install && npm run dev   # http://localhost:5173
cd app && npm test                     # derive + alerts + render (vitest)
cd app && npm run build                # tsc --strict + vite build
```
`scripts/setup.sh` installs app+api, optionally loads schema.

## Architecture
`app/src/lib/derive.ts`: load-bearing+pure — `deriveStatus`,`derivePriority`,`isRequired`,`relevantPayments`,`allAlerts`,`responsibleOf`(tested).
`app/src/store/store.tsx`: context `{role, files, toast}`+mutations; screens read `deriveStatus(file)` on render(live).
`app/src/data/seed.ts`: 7 files/status branch; file 5=2 invoices/2 suppliers.

## Data model — multi-invoice native
File=1 BL/1 customs clearance: `invoices: Invoice[]`(≥1); supplier/value/CI+PL on each `Invoice` — `ImportFile` has **no** top-level `supplier`/`usd` mirror. Worth=`fileValueInr(f)`, vendor=`supplierLabel(f)`. `allDocs(f)`=file docs+every invoice's CI/PL.

## deriveStatus ladder
```
statusManual            -> held status (e.g. 'closed')
doDone && ooc           -> goods_received     # BEFORE duty_paid, else dead code
dutyPaid                -> duty_paid
!anyGateUploaded        -> draft
gateMissing>0 || disc   -> documents_pending
payPending(adv/bal)     -> bank_work
else                    -> cha_work
```
Gate docs=pre-customs docs from supplier/forwarder. Customs outputs(BOE,challan,assessment,OOC,DO)=made during CHA work, don't block documents→cha_work(tracked in CHA tab).

## Required-doc rules (`isRequired`)
`certificate_of_origin`,`bank_letter`=optional. `insurance_copy`: not required CIF. `freight_invoice`: not required CIF/CFR. `bill_of_lading`(sea)/`awb`(air) by mode; `commercial_invoice`/`packing_list` always required(per invoice). `relevantPayments` mirrors: CIF drops insurance+freight, CFR drops freight.

## §0 hard rules (enforced)
Financials role-gated(`lib/rolePolicy.ts`): value/FX,Payments,duty,**HSN**,landed cost,**Approve**=Accountant+Owner/Admin only; Import Manager+external never see financial fields.
`canMarkClosed`=Admin/Owner only.
External=tokenized routes, no nav/toggle: `/u/:fileNumber/fwd/:token`,`/u/:fileNumber/cha/:token`; zh-CN default CN parties, CHA link=English.
Create≤3 fields(invoice no,amount,ETA); blank wizard=advanced.
Every screen: what/pending/who+1 primary action.

## Alerts (`allAlerts`)
6 kinds sorted `demurrage → eta → approval_required → discrepant → overdue → missing`. Dashboard `slice(0,2)`; nav badge=count. Other §13 types: PendingDocs/PendingPayments/ChaDesk(Phase A).

## i18n
External only(`app/src/i18n/`); internal=English. Bilingual labels+zh correction reasons(`CORRECTION_REASONS` in `lib/docs.ts`). utf8mb4 throughout.

## Conventions
Tailwind 3.4 tokens(`tailwind.config.ts`); status/doc tints=data in `lib/docs.ts`(inline style, not classes). React Router 6; `useIsMobile()`(880px) swaps Sidebar↔MobileBottomNav. No root `package.json` — `app/`+`api/` independent.
