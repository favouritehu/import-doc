# Import Desk — PRODUCT.md

register: product

## Product purpose
One place that answers, per import shipment: **what is this, where is it, what is
pending, who is responsible.** Replaces WhatsApp threads + shared Drive folders
for Favourite Fab's China/SE-Asia imports into India (INR, GST/IGST, CHA-driven
customs clearance).

## Users
- **Owner (admin):** glances 2–3×/day, mostly phone. Wants: which shipments are at
  risk, money exposure, one-tap chase.
- **Import manager:** the daily driver, desktop. Creates files, uploads docs,
  tracks containers, chases suppliers/CHA. NEVER sees financials/HSN (hard rule).
- **Accountant:** payments, duty, FX, landed cost.
- **External (supplier/forwarder/CHA):** magic-link pages only; zh-CN default for
  Chinese suppliers; no nav, no financials.

## Tone
Calm, factual, terse. An operations tool, not a marketing surface. Numbers first.
Hindi-English workplace: use simple English words, no jargon ("Send", not
"Dispatch correspondence").

## Strategic principles
1. Work by exception: the app surfaces what needs attention; users never scan lists.
2. Derived truth: status is computed from docs/payments/CHA state, never hand-set.
3. ≤3 typed fields to create anything; AI (scan/paste) fills the rest.
4. Free-carrier tracking loop: Open tracking → extension/paste → data flows back.
5. Per-browser fallback always works; shared Postgres when connected.

## Anti-references
- Generic admin dashboards (hero metrics, identical card grids, chart soup).
- ERP density without hierarchy (Tally/SAP walls of fields).
- Consumer-app playfulness (confetti, mascots) — money and customs are serious.
