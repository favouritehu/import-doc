# Export Desk A+B — rebrand + desk switcher design

## Goal
Turn the lone `/exports` link into a first-class **Export Desk** with a top-level
**Import Desk ⇄ Export Desk** switch that swaps the whole sidebar nav. Cheap,
visible slice. Also fold in three deferred Phase-1 minors.

## Scope
- **A. Rebrand:** nav label `Exports` → `Export Files`; export list TopBar title →
  `Export Desk`. Route paths unchanged (`/exports`, `/exports/:id`).
- **B. Desk switcher:** segmented `Import Desk | Export Desk` control that swaps the
  nav context and routes to that desk's home.
- **Minors:** payments-tab blank-flip fallback, missing-doc double-surface filter,
  seed a payable row.

Out of scope (→ Phase D): parallel export Dashboard/Today/Calendar/Pending/CHA/
Reports screens, export server sync.

## Desk state — new `app/src/store/desk.tsx` (`DeskProvider`)
Tiny React context, NO entanglement with either store.
```ts
type Desk = 'import' | 'export';
// { desk: Desk; setDesk(d: Desk): void }
```
- localStorage key `import-desk-active-desk`, default `'import'`.
- A `<DeskRouteSync/>` effect (inside Router) reads `useLocation().pathname`:
  - `pathname === '/exports' || pathname.startsWith('/exports/')` → `setDesk('export')`
  - path matches a known **import-specific** screen (`/`, `/today`, `/calendar`,
    `/files`, `/files/*`, `/pending-docs`, `/pending-payments`, `/cha-desk`,
    `/reports`) → `setDesk('import')`
  - **shared** screens (`/settings`) → leave desk unchanged (desk sticks).
- `useDesk()` hook; throws outside provider.
- Wrap in `main.tsx` INSIDE the stores, around `<App/>` (needs Router context for
  the sync effect — so the sync effect lives in a child rendered under
  `BrowserRouter`, e.g. mounted in `AppShell` or `App`).

## Nav model — `app/src/lib/nav.ts` (additive)
Add `desk` to `NavDef`:
```ts
export type NavDesk = 'import' | 'export' | 'both';
export interface NavDef { key; label; path; roles: Role[]; badge: BadgeKey; desk: NavDesk }
```
- Existing 8 screens (today/home/calendar/files/pending-docs/pending-payments/
  cha/reports) → `desk: 'import'`.
- `settings` → `desk: 'both'`.
- The `exports` entry → `{ key:'exports', label:'Export Files', path:'/exports',
  roles: ALL, badge: null, desk: 'export' }`.
- New selector (keep `navForRole` for back-compat if still used, else replace):
```ts
// nav.ts owns no store dep — desk param is the plain literal union.
export const navFor = (desk: 'import' | 'export', role: Role): NavDef[] =>
  NAV.filter((n) => (n.desk === 'both' || n.desk === desk) && n.roles.includes(role));
```
`desk.tsx` re-exports / aligns its `Desk` type to this same `'import' | 'export'`
union. Replace `navForRole` call sites (`Sidebar`, `MobileBottomNav`) with
`navFor`; drop `navForRole` if no other caller (grep first).
Import mode therefore no longer shows a standalone Exports link (it's a desk);
export mode shows `Export Files` + `Settings`.

## Switcher UI — segmented control
New `app/src/components/DeskSwitch.tsx`: two-segment control
`Import Desk | Export Desk`. Active segment = `desk`. Click → `setDesk(d)` +
`navigate(d === 'export' ? '/exports' : '/')`.
- **Desktop:** render at the top of `Sidebar` (above the nav list). Sidebar reads
  `navFor(desk, role)` instead of `navForRole(role)`.
- **Mobile:** render a compact twin in `MobileBottomNav` (e.g. a slim toggle row
  above the bottom bar, or the two desks as the first control). `MobileBottomNav`
  also reads `navFor(desk, role)`.

Styling: reuse existing token classes; mirror the role-switch segmented control's
look for consistency.

## Rebrand (A)
- `nav.ts`: label `Export Files` (above).
- `ExportFilesList` TopBar `title="Export Desk"` (was "Export files"); subtitle
  keeps `${n} total`.
- Sidebar brand mark unchanged; the DeskSwitch names the desks. Welcome untouched.

## Deferred Phase-1 minors (this build)
1. **Payments blank-flip** — `ExportFileDetail`: when the active `tab` is not
   permitted for the current role (e.g. `payments` under a non-financial role),
   fall back to rendering `summary`. (Guard the tab-body switch, not just the tab
   list.)
2. **Missing-doc double-surface** — `ExportFileDetail` Summary aside: the
   `gatePending` callout already lists missing gate docs, so filter
   `kind !== 'missing'` out of the `exportFileAlerts(file)` list rendered beside it
   (avoid showing the same missing doc twice).
3. **Seed a payable** — `exportSeed.ts`: add one payable `ExportPayment` (e.g.
   `freight` or `cha_charges`, `direction:'payable'`) to a suitable file so the
   Payables group renders non-empty. Keep that file's derived status unchanged
   (payables never gate).

## Testing (baseline must stay ≥120, grow)
- New `nav.test.ts`: `navFor('import', role)` excludes `exports`; includes the 8
  import screens (role-filtered) + settings. `navFor('export', role)` = `[Export
  Files, Settings]` (role-filtered); excludes Pending Docs/CHA/etc. Settings in
  both. Role filter still applies (import_manager doesn't get pending-payments).
- Render test: Sidebar in `desk='export'` shows "Export Files", not "Pending Docs".
- Minor #1: a focused test/assertion that a non-financial role on `?tab=payments`
  renders Summary content, not blank.
- Existing 120 stay green; no edits to derive engines or stores' behavior.
- Verify: `npx tsc --noEmit` · `npx vitest run` · `npm run build` all clean.

## Constraints
- Additive/surgical only. Do NOT change `deriveExport.ts`/`derive.ts`/store
  behavior. `DeskProvider` is new; nav/shell edits are additive.
- §0 gating untouched — desk switch is orthogonal to role gating.
