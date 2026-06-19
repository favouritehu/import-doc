# Import Desk — agent scope guard

## Identity
Phase-A frontend for the Favourite Fab Import Control Tower. Build on dummy data seeded to the
real schema (`db/schema.sql`). Keep the Phase-B swap mechanical: every dummy object mirrors a row.

## Hard rules (do not regress)
1. **Financials are role-gated** through `app/src/lib/rolePolicy.ts` only. Never read invoice
   value, FX, duty, **HSN**, landed cost, or render the Payments tab / Approve action for
   Import Manager or any external party. Add new financial UI behind a `RolePolicy.*` gate.
2. **No top-level supplier/value mirror on `ImportFile`.** Read worth via `fileValueInr(f)` and
   vendor via `supplierLabel(f)`. CI/PL live on `Invoice`, never in `f.docs`.
3. **`deriveStatus` is the single source of status.** Don't hand-set or cache a status string in
   the UI; render `deriveStatus(file)`. Keep `app/src/lib/derive.ts` pure and tested.
4. **External pages have no navigation** and never show costing/HSN/other files. Forwarder and
   CHA are separate routes — no party toggle.
5. **No ERP jargon** in UI strings ("module/entity/record/submit for processing"). Use the
   user's language: import file, shipment, documents.

## Build / verify
- `cd app && npm run build` must pass clean under `strict`.
- `cd app && npm test` (derive + alerts + render) must stay green; add cases with new rules.
- `cd api && npm run build` must stay clean. API routes are 501 stubs until Phase B.

## Git / deploy
- Work on a feature branch; never commit `.env`, `node_modules/`, or `dist/`.
- Do not open a PR or deploy unless explicitly asked.
- The DeepSeek AI addendum is **out of scope** for this build — do not add it without sign-off.
