# Import Desk

**Favourite Fab Import Control Tower** — a mobile-first React app for tracking India imports
(INR, FY Apr–Mar, GST/IGST). It answers, per shipment: *what import is this, what is pending,
and who is responsible* — with status **derived live** from documents, payments, and CHA state.

> Phase A ships the frontend on dummy data seeded to the real control-tower schema. The
> MySQL schema and Fastify API are authored now and wired in Phase B; the swap is mechanical
> because every dummy object mirrors a table row.

## Quick start
```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: derive + alerts + render
npm run build      # tsc --strict + vite build
```
Or run everything via `bash scripts/setup.sh` then `bash scripts/dev.sh`.

## What to try
1. **Role switcher** (top bar): Admin → Import Mgr → Accountant. Watch the nav and every
   financial / HSN field appear and disappear.
2. **Create a file**: ✨ pick a template (3 fields) or the blank wizard (add 2 invoices from
   2 suppliers). The new file's status derives automatically.
3. **Documents tab** → click a row → upload / approve / flag a discrepancy (9 structured
   zh reasons) → simulate a corrected re-upload. The status badge recomputes live.
4. **Generate link** on a file → copy the Forwarder (中文) and CHA links → open the scoped,
   nav-less external pages.

## Layout
```
app/   Vite + React 18 + TS (strict) + Tailwind 3.4 — the Phase-A application
api/   Fastify 5 backend — route stubs now, wired in Phase B
db/    schema.sql (14 tables) + migrations
scripts/ setup.sh · dev.sh
```

See `CLAUDE.md` for the data model, the deriveStatus ladder, and the §0 hard rules.

## Stack
React 18 · Vite 5 · TypeScript (strict) · Tailwind 3.4 · React Router 6 · Vitest ·
Fastify 5 + MySQL 8 (Phase B).
