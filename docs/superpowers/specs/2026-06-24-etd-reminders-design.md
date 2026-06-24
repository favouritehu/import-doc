# Import Desk — ETD Reminders + 5 "super-easy" features

> Design + phased implementation spec. Approved 2026-06-24.
> Build target: `generated/import-desk/` (standalone repo, origin `import-doc.git`, branch `main`).
> This document is the SINGLE SOURCE the build agents follow. Read it fully before editing.

---

## 0. Conventions every phase MUST follow

- **Orient before reading source:** if `graphify-out/graph.json` exists, run `graphify query "<question>"` first; otherwise read files directly. (This subdir has no graph — read files directly.)
- **App** = `app/` (Vite + React 18 + TS strict + Tailwind 3.4 + React Router 6 + Vitest). **API** = `api/` (Fastify 5 + tsx, port 8787; holds keys, browser never sees them).
- **Derive-live philosophy:** screens read pure functions on render (`deriveStatus`, `allAlerts`). New date/reminder logic follows the same pattern — pure, `today` injected, unit-tested.
- **No secrets in client or commits.** Integration config (n8n webhook URL) lives only in `api/.env` (gitignored). Never put it in `app/`. Scan diffs for `AIzaSy`, `sk-…`, webhook URLs before committing.
- **Multi-invoice model:** `ImportFile.invoices: Invoice[]` (≥1), no top-level supplier/usd mirror. Read worth via `fileValueInr(f)`, vendor via `supplierLabel(f)` / `distinctSuppliers(f)` (in `lib/format.ts`).
- **Verify gate per phase:** `cd app && npm run build` (tsc --strict + vite) AND `npm test` (vitest) must be GREEN. For phases touching `api/`, also `cd api && npm run build`. Loop until green; if it cannot be made green, STOP and report.
- **Do NOT commit, do NOT push.** Leave changes in the working tree; the orchestrator commits and the user pushes.
- **No live email/WhatsApp send in Phase A.** The n8n hook ships as a contract + a manual "send test" + graceful 503 degrade. Production daily-cron email is documented only.
- Tailwind status/doc tints are data in `lib/docs.ts` consumed as inline `style`, NOT Tailwind classes. Colors available as Tailwind tokens: `navy, blue, amber, green, red, page, border, ink, muted, faint, medium, divider`.

### Key file map
```
app/src/types/index.ts            ImportFile, Invoice, etc.
app/src/lib/derive.ts             deriveStatus, derivePriority, allAlerts, responsibleOf
app/src/lib/format.ts             inr, fileValueInr, supplierLabel, distinctSuppliers
app/src/lib/docs.ts               DOC_META, labels, tints, CORRECTION_REASONS
app/src/lib/pending.ts            filesNeedingDocs, filesNeedingPayments
app/src/lib/ai.ts                 client AI calls (aiExtract, aiClassify, aiDiscrepancy, aiTranslate)
app/src/store/store.tsx           React context store: files, all mutations, IDB persist
app/src/screens/                  Dashboard, FilesList, FileDetail, CreateFile, Today(new), Calendar(new), …
app/src/components/               AppShell(Sidebar/MobileBottomNav), TopBar, ImportFileCard, Badge, …
app/src/App.tsx                   routes
app/src/test/                     derive.test.ts, alerts.test.ts, render.test.tsx
api/src/services/ai.ts            Gemini/DeepSeek calls + coercion
api/src/routes/ai.ts              /ai/* routes
api/src/server.ts                 route registration
api/.env.example                  config template
```

---

## 1. Data model + dates (Phase 1)

### Type changes — `app/src/types/index.ts`
- `ImportFile`: add `etd?: string;` (ISO `YYYY-MM-DD`, departure date). `eta` stays `string` (now treated as ISO going forward; legacy values parsed leniently). `etaDays` stays (fallback only).

### New `app/src/lib/dates.ts` (pure)
```ts
export function todayIso(): string;                 // local date YYYY-MM-DD (uses real Date — app code, OK)
export function parseDate(s?: string | null): Date | null;  // ISO, dd/mm/yyyy, dd-mm-yyyy, '' -> null; lenient
export function daysBetween(fromIso: string, toIso: string): number | null; // whole days to - from; null if unparseable
export function fmtDate(s?: string | null): string; // display e.g. "02 Jul 2026"; '' if unparseable
export function isoOf(d: Date): string;
```
Unit tests: parseDate handles ISO + dd/mm/yyyy + junk + empty; daysBetween sign + null; fmtDate.

### New `app/src/lib/reminders.ts` (pure, `today` injected)
```ts
export type ReminderStatus = 'green' | 'amber' | 'red';
export interface ShipmentReminder {
  fileId: number; fileNumber: string;
  kind: 'etd' | 'eta';
  date: string;            // ISO
  daysLeft: number;        // negative = past
  status: ReminderStatus;
  label: string;           // "departs in 8 days" | "departed" | "arrives in 3 days" | "arrived" | "overdue"
}
export interface ShipmentTimeline {
  etd?: string; eta?: string;
  departed: boolean; arrived: boolean;
  pct: number;             // 0..100 progress etd->eta by today
  status: ReminderStatus;
}
export const AMBER_DAYS = 3;   // tunable
export function shipmentReminders(file: ImportFile, today: string): ShipmentReminder[];
export function allReminders(files: ImportFile[], today: string): ShipmentReminder[]; // sorted by date asc
export function shipmentTimeline(file: ImportFile, today: string): ShipmentTimeline;
export function dueReminderCount(files: ImportFile[], today: string): number; // amber+red, for nav badge
```
**Status rules:**
- `daysLeft > AMBER_DAYS` → `green`; `0 <= daysLeft <= AMBER_DAYS` → `amber`; `daysLeft < 0` → `red` UNLESS the milestone is done (etd past + departed, or eta past + arrived) → then neutral/`green`.
- `departed` = `etd` set and `today >= etd`. `arrived` = `arrivedOn` set OR `deriveStatus(file) === 'goods_received'`. (Import `deriveStatus` from derive.ts; keep reminders.ts dependency on derive minimal — or pass an `arrived` predicate; simplest: read `arrivedOn` + status.)
- `shipmentReminders`: emit an `etd` reminder if `etd` set and not yet departed (else a muted "departed"); emit an `eta` reminder if `eta` parseable and not arrived (else "arrived"). Skip files with no usable dates.
- `pct`: 0 before etd, 100 after eta/arrived, linear between.

Tests (`app/src/test/reminders.test.ts`): green/amber/red boundaries at AMBER_DAYS; departed/arrived neutralization; allReminders sort; dueReminderCount; timeline pct endpoints. Inject fixed `today`.

**Phase-1 acceptance:** new libs + tests green; existing 29 tests still green; build clean. No UI yet.

---

## 2. ETD field + timeline UI (Phase 2)

- **Date inputs (`type="date"`, ISO value):** add an **ETD** picker wherever ETA is editable — `EditFileModal` (FileDetail) and the blank wizard shipment step (`CreateFile`). When `etd` is set, render a small green "set ✓" affordance. The AI extract result already may carry `eta`; thread `etd` through if present (the extract `file` object has no etd today — add `etd: ''` to the extract types in `api/services/ai.ts` + `app/lib/ai.ts` ExtractResult.file, coerce, and map in CreateFile review). Keep it optional.
- **`store.tsx`:** ensure `createBlank`/`updateFile`/`createFromExtract` accept + persist `etd`. (Most flow through existing inputs; add the field.)
- **Timeline component** `app/src/components/ShipmentTimeline.tsx`: props `{ file, variant: 'card' | 'detail' }`. Renders `ETD ●────── ETA` bar with a status-colored dot at `timeline.pct`, endpoint dates (`fmtDate`), and the active label ("departs in Xd" / "departed" / "arrives in Xd" / "arrived" / "overdue"). Colors from `ReminderStatus` (green `#16A34A`, amber `#F59E0B`, red `#DC2626`). Compact for card, fuller for detail.
- **ImportFileCard:** insert the `card` timeline (slim) below the invoice list, above the status/value row. Degrade gracefully when no dates (hide bar, keep nothing or a faint "No dates yet").
- **FileDetail header:** add the `detail` timeline near the ProgressStepper.

**Phase-2 acceptance:** set ETD on a file → card + detail show the timeline + correct green/amber/red dot + countdown; build + 29-and-new tests green.

---

## 3. Today view + nav badge + dashboard reminders (Phase 3)

- **New screen** `app/src/screens/Today.tsx`, route `/today` in `App.tsx`. One urgency-sorted list merging, across all files: `allReminders` (etd/eta) + `filesNeedingDocs` (missing/discrepant) + `filesNeedingPayments` + demurrage (from `allAlerts`). Each row: status dot, file number, supplier label, one-line reason, → navigates to the file. Group/sort red → amber → green. Empty state when nothing due.
- **Nav:** add "Today" to `Sidebar` + `MobileBottomNav` (and role-aware nav in `App.tsx`/wherever nav items are built). Badge = `dueReminderCount(files, todayIso())` (or merged due count). Make `/today` the default landing redirect from `/` ONLY if simple; otherwise keep Dashboard and add Today as a top item. (Prefer: add Today as first nav item; do not remove Dashboard.)
- **Dashboard:** add a compact "Upcoming" reminders block (top 3 `allReminders`) linking to `/today`.

**Phase-3 acceptance:** Today lists real due items sorted by urgency; nav badge count matches; build + tests green.

---

## 4. Shipments calendar/board (Phase 4)

- **New screen** `app/src/screens/Calendar.tsx`, route `/calendar`, nav item. Month grid (current month, prev/next). Each file places a chip on its `etd` day ("▲ departs") and `eta` day ("▼ arrives"), color-coded by that reminder's status. Click chip → file. **Mobile (≤880px):** render an agenda list (date-grouped) instead of the grid.
- Pure month-grid helper may live in `lib/dates.ts` (e.g. `monthMatrix(year, month)`).
- No new persistence; reads files + reminders engine.

**Phase-4 acceptance:** calendar shows ETD/ETA chips on correct days, color-coded, click-through works, mobile agenda fallback; build + tests green.

---

## 5. AI chase message + paste-to-update (Phase 5)

### F5 — Supplier chase message
- **api** `api/src/services/ai.ts`: `chaseMessage({ supplier, invoiceNumber, fileNumber, missing: string[], lang })` → DeepSeek text (cheap, `textProvider`), returns `{ text }` — a polite bilingual EN + 中文 message listing the pending docs. Coerce to string. Route `POST /ai/chase` in `api/src/routes/ai.ts`.
- **app** `lib/ai.ts`: `aiChase(payload)`. UI: on FileDetail Documents tab, when a file/invoice has missing/discrepant docs, a **"Draft chase message"** button → modal showing the generated text + **Copy** + **WhatsApp** (`https://wa.me/?text=` encoded). Graceful 503 degrade.

### F6 — Paste-to-update
- **api** `api/src/services/ai.ts`: `extractUpdate(text)` → DeepSeek text → proposes changed file fields `{ etd?, eta?, blAwb?, shippingLine?, forwarder?, portLoading?, portArrival? }` (coerce; ignore unknowns; dates → ISO). Route `POST /ai/update`.
- **app** `lib/ai.ts`: `aiUpdate(text)`. UI: FileDetail header/Summary **"Paste an update"** → modal textarea → on extract, show a **diff** (current → proposed) per field with checkboxes → **Apply** calls `store.updateFile(id, patch)` for accepted fields. No silent writes. Graceful degrade.

**Phase-5 acceptance:** with API running, chase produces bilingual text + WhatsApp link; paste produces a confirmable field diff that applies. Without API: graceful "AI not running" message. api + app build + tests green. (Gemini key may be out of credits — DeepSeek text path is used for both, so these should work on the user's DeepSeek key.)

---

## 6. n8n reminder hook (Phase 6, production-ready contract)

- **api** new `api/src/routes/reminders.ts`: `POST /reminders/test { fileNumber, kind, date, daysLeft, suppliers, product, to? }` → builds the payload and POSTs to `process.env.N8N_REMINDER_WEBHOOK`; 503 `reminders_not_configured` when unset; 502 on upstream fail. Register in `server.ts`.
- **Payload contract** (documented + emitted): `{ event:'shipment_reminder', fileNumber, kind:'etd'|'eta', date, daysLeft, suppliers:string[], product, to:{ email?:string }, appUrl }`.
- **api/.env.example:** add `N8N_REMINDER_WEBHOOK=`, `REMINDER_AMBER_DAYS=3`. (Do NOT touch `api/.env` secrets.)
- **app** `lib/reminders` client call `sendTestReminder(reminder)` → `POST /reminders/test`. UI: on a file's timeline/Today row, a small **"Send test reminder"** action (admin) → friendly toast on success / "n8n not configured" on 503.
- **Docs:** add `docs/n8n-reminders.md` describing the production daily-cron flow: n8n Schedule node → (Phase B) query upcoming ETD/ETA from backend → Email/WhatsApp node using the payload. Phase A only wires the manual test + contract.

**Phase-6 acceptance:** `/reminders/test` posts to the webhook when set (or 503 when not); `.env.example` updated; doc written; no secrets committed; api + app build + tests green.

---

## 7. Build order & integration

Sequential (each builds on the prior, shared files): **P1 → P2 → P3 → P4 → P5 → P6.**
P1 is foundational — if it fails, abort. Each phase ends green (tsc-strict + vite + vitest; api build for P5/P6). After all phases: full `app` build + test + `api` build, then the orchestrator commits per phase and the user pushes. Each phase is independently shippable — the user may stop after any.

## 8. Out of scope (do not build)
Live email/WhatsApp sending from Phase A; per-file recurring reminder CRUD; calendar drag-to-reschedule; timezone handling beyond local date; persisting AI usage. Real n8n cron email lands with the Phase-B backend.
