# Export Desk A+B (rebrand + desk switcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Turn `/exports` into a first-class Export Desk with an Import⇄Export nav switcher, and fold in 3 deferred Phase-1 minors.

**Architecture:** New tiny `DeskProvider` (localStorage, route-synced) holds `desk`. `nav.ts` gains a `desk` field + `navFor(desk, role)`. Sidebar & MobileBottomNav render `navFor` and host a `DeskSwitch` segmented control. Surgical/additive — no derive/store behavior changes.

**Tech Stack:** React 18 + TS strict, Vite, Tailwind 3.4, React Router 6, vitest.

**Spec:** `docs/superpowers/specs/2026-07-12-export-desk-switcher-design.md` (authoritative — read first).
**Branch:** `feat/export-desk-switcher` (already checked out).

## Global Constraints
- Additive/surgical only. Do NOT change `deriveExport.ts`/`derive.ts`/store behavior, or §0 role gating.
- Route paths unchanged: `/exports`, `/exports/:id`.
- `nav.ts` owns no store dependency — `navFor`'s desk param is the plain literal union `'import' | 'export'`.
- Baseline: 120 tests must stay green and grow. Final gate: `npx tsc --noEmit` · `npx vitest run` · `npm run build` all clean (run from `app/`).
- Commit after each task. Match existing code style/tokens.

---

### Task 1: Desk-scoped nav model + rebrand label

**Files:**
- Modify: `app/src/lib/nav.ts`
- Test: `app/src/test/nav.test.ts` (create)

**Interfaces:**
- Produces: `type NavDesk = 'import'|'export'|'both'`; `NavDef` gains `desk: NavDesk`; `navFor(desk: 'import'|'export', role: Role): NavDef[]`.

- [ ] **Step 1: Write failing test** — `app/src/test/nav.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { navFor } from '../lib/nav';

describe('navFor', () => {
  it('import desk (admin) has import screens, not the export desk link', () => {
    const keys = navFor('import', 'admin').map((n) => n.key);
    expect(keys).toContain('files');
    expect(keys).toContain('today');
    expect(keys).toContain('settings');       // shared
    expect(keys).not.toContain('exports');    // export lives in the other desk
  });
  it('export desk (admin) = Export Files + Settings only', () => {
    const keys = navFor('export', 'admin').map((n) => n.key);
    expect(keys).toEqual(['exports', 'settings']);
  });
  it('export desk link is labelled "Export Files"', () => {
    expect(navFor('export', 'admin').find((n) => n.key === 'exports')?.label).toBe('Export Files');
  });
  it('role filter still applies inside a desk', () => {
    const keys = navFor('import', 'import_manager').map((n) => n.key);
    expect(keys).not.toContain('pending-payments'); // accountant/admin only
    expect(keys).toContain('pending-docs');
  });
});
```

- [ ] **Step 2: Run, verify fail** — `cd app && npx vitest run src/test/nav.test.ts` → FAIL (navFor undefined / desk missing).

- [ ] **Step 3: Implement** — edit `app/src/lib/nav.ts`:
  - Add `export type NavDesk = 'import' | 'export' | 'both';`
  - Add `desk: NavDesk` to `NavDef`.
  - Set `desk` on every NAV entry: `today/home/calendar/files/pending-docs/pending-payments/cha/reports` → `'import'`; `settings` → `'both'`.
  - Change the `exports` entry to `{ key: 'exports', label: 'Export Files', path: '/exports', roles: ALL, badge: null, desk: 'export' }` and move it after `settings` (order within export desk: Export Files then Settings — keep it before settings in array OR rely on filter order; test expects `['exports','settings']`, so `exports` entry must appear before `settings` in NAV). Keep `exports` where it is (line ~21, before settings) — that already yields `['exports','settings']` order for export desk. Just add the `desk` fields.
  - Add:
```ts
export const navFor = (desk: 'import' | 'export', role: Role): NavDef[] =>
  NAV.filter((n) => (n.desk === 'both' || n.desk === desk) && n.roles.includes(role));
```
  - Keep `navForRole` as-is for now (Task 3 migrates callers; remove only if grep shows no remaining caller).

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/test/nav.test.ts` → PASS. Then `npx tsc --noEmit` clean (adding a required `desk` field to NavDef will error anywhere a NavDef literal omits it — the only literals are in NAV; confirm all updated).

- [ ] **Step 5: Commit**
```bash
git add app/src/lib/nav.ts app/src/test/nav.test.ts
git commit -m "feat(export): desk-scoped nav model + navFor, rebrand Exports->Export Files"
```

---

### Task 2: DeskProvider + route sync + wiring

**Files:**
- Create: `app/src/store/desk.tsx`
- Modify: `app/src/main.tsx`
- Test: `app/src/test/desk.test.tsx` (create)

**Interfaces:**
- Consumes: none.
- Produces: `type Desk = 'import' | 'export'`; `DeskProvider` (React FC, optional `initialDesk?: Desk` prop for tests); `useDesk(): { desk: Desk; setDesk(d: Desk): void }`; `DeskRouteSync` (component, mount under Router — sets desk from pathname).

- [ ] **Step 1: Write failing test** — `app/src/test/desk.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DeskProvider, useDesk } from '../store/desk';

function Probe() {
  const { desk } = useDesk();
  return <span>desk:{desk}</span>;
}

describe('DeskProvider', () => {
  it('defaults to import', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><DeskProvider><Probe /></DeskProvider></MemoryRouter>,
    );
    expect(html).toContain('desk:import');
  });
  it('honors initialDesk', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><DeskProvider initialDesk="export"><Probe /></DeskProvider></MemoryRouter>,
    );
    expect(html).toContain('desk:export');
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/test/desk.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement** `app/src/store/desk.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export type Desk = 'import' | 'export';
const KEY = 'import-desk-active-desk';

interface DeskCtx { desk: Desk; setDesk: (d: Desk) => void }
const Ctx = createContext<DeskCtx | null>(null);

function load(initial?: Desk): Desk {
  if (initial) return initial;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'export' || v === 'import') return v;
  } catch { /* SSR / no storage */ }
  return 'import';
}

export function DeskProvider({ children, initialDesk }: { children: ReactNode; initialDesk?: Desk }) {
  const [desk, setDeskState] = useState<Desk>(() => load(initialDesk));
  const setDesk = (d: Desk) => {
    setDeskState(d);
    try { localStorage.setItem(KEY, d); } catch { /* ignore */ }
  };
  return <Ctx.Provider value={{ desk, setDesk }}>{children}</Ctx.Provider>;
}

export function useDesk(): DeskCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDesk must be used within DeskProvider');
  return c;
}

const IMPORT_PATHS = ['/', '/today', '/calendar', '/files', '/pending-docs', '/pending-payments', '/cha-desk', '/reports'];

/** Keeps `desk` in sync with the route: export routes force export, known import
 *  screens force import, shared screens (/settings) leave it unchanged. Mount once under Router. */
export function DeskRouteSync() {
  const { pathname } = useLocation();
  const { desk, setDesk } = useDesk();
  useEffect(() => {
    const isExport = pathname === '/exports' || pathname.startsWith('/exports/');
    const isImport = IMPORT_PATHS.includes(pathname) || pathname.startsWith('/files/');
    if (isExport && desk !== 'export') setDesk('export');
    else if (isImport && desk !== 'import') setDesk('import');
    // shared (e.g. /settings): leave desk unchanged
  }, [pathname, desk, setDesk]);
  return null;
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/test/desk.test.tsx` → PASS.

- [ ] **Step 5: Wire providers** — `app/src/main.tsx`: import `DeskProvider`, wrap `<App/>` INSIDE the export store:
```tsx
<StoreProvider>
  <ExportStoreProvider>
    <DeskProvider>
      <App />
    </DeskProvider>
  </ExportStoreProvider>
</StoreProvider>
```
(`DeskRouteSync` is mounted in Task 3 inside `AppShell`, which renders under `BrowserRouter`.)

- [ ] **Step 6: Verify + commit** — `npx tsc --noEmit` clean · `npx vitest run` green.
```bash
git add app/src/store/desk.tsx app/src/test/desk.test.tsx app/src/main.tsx
git commit -m "feat(export): DeskProvider (localStorage + route sync), wired into app"
```

---

### Task 3: DeskSwitch UI + Sidebar/MobileBottomNav integration + rebrand title

**Files:**
- Create: `app/src/components/DeskSwitch.tsx`
- Modify: `app/src/components/Sidebar.tsx`, `app/src/components/MobileBottomNav.tsx`, `app/src/components/AppShell.tsx` (mount `DeskRouteSync`), `app/src/screens/ExportFilesList.tsx` (TopBar title)
- Test: `app/src/test/deskNav.test.tsx` (create)

**Interfaces:**
- Consumes: `useDesk`, `DeskRouteSync` (Task 2); `navFor` (Task 1).
- Produces: `DeskSwitch` component.

- [ ] **Step 1: Read templates** — Read `Sidebar.tsx` and `MobileBottomNav.tsx` fully to match their markup/token classes and how they currently call `navForRole(role)`. Read the role-switch segmented control (in `TopBar.tsx`) to mirror its styling for `DeskSwitch`.

- [ ] **Step 2: Write failing render test** — `app/src/test/deskNav.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { StoreProvider } from '../store/store';
import { DeskProvider } from '../store/desk';
import { Sidebar } from '../components/Sidebar';

function renderSidebar(desk: 'import' | 'export') {
  return renderToStaticMarkup(
    <MemoryRouter><StoreProvider><DeskProvider initialDesk={desk}><Sidebar /></DeskProvider></StoreProvider></MemoryRouter>,
  );
}
describe('Sidebar desk scoping', () => {
  it('export desk shows Export Files, not Pending Docs', () => {
    const html = renderSidebar('export');
    expect(html).toContain('Export Files');
    expect(html).not.toContain('Pending Docs');
  });
  it('import desk shows Pending Docs, not Export Files', () => {
    const html = renderSidebar('import');
    expect(html).toContain('Pending Docs');
    expect(html).not.toContain('Export Files');
  });
});
```

- [ ] **Step 3: Run, verify fail** — `npx vitest run src/test/deskNav.test.tsx` → FAIL (Sidebar still uses navForRole; may show wrong items or crash without DeskProvider).

- [ ] **Step 4: Implement DeskSwitch** — `app/src/components/DeskSwitch.tsx`: a two-segment control. Use `useDesk()` + `useNavigate()`. Mirror the TopBar role-switch classes.
```tsx
import { useNavigate } from 'react-router-dom';
import { useDesk } from '../store/desk';

export function DeskSwitch() {
  const { desk, setDesk } = useDesk();
  const nav = useNavigate();
  const go = (d: 'import' | 'export') => { setDesk(d); nav(d === 'export' ? '/exports' : '/'); };
  const segs: { d: 'import' | 'export'; label: string }[] = [
    { d: 'import', label: 'Import Desk' },
    { d: 'export', label: 'Export Desk' },
  ];
  // Render a segmented control; active seg = desk. Reuse existing token classes
  // (match TopBar role switch). Buttons call go(seg.d).
  return (/* segmented control markup — match role-switch styling */ null as any);
}
```
Replace the `null as any` with real segmented-control JSX mirroring the role switch (two buttons, active styled via `desk === seg.d`). Do NOT ship `null as any`.

- [ ] **Step 5: Integrate Sidebar** — in `Sidebar.tsx`: import `useDesk` + `navFor` + `DeskSwitch`; replace `navForRole(role)` with `navFor(useDesk().desk, role)`; render `<DeskSwitch />` at the top of the sidebar (above the nav list).

- [ ] **Step 6: Integrate MobileBottomNav** — in `MobileBottomNav.tsx`: same swap to `navFor(desk, role)`; add a compact `DeskSwitch` (slim row above the bottom bar). Keep it unobtrusive; reuse DeskSwitch (it can style compactly, or accept a `compact` prop if needed).

- [ ] **Step 7: Mount route sync + rebrand title** — in `AppShell.tsx` render `<DeskRouteSync />` once (it returns null; place near `<Outlet />`). In `ExportFilesList.tsx` change the `TopBar` `title` from `"Export files"` to `"Export Desk"`.

- [ ] **Step 8: Run, verify pass** — `npx vitest run src/test/deskNav.test.tsx` → PASS. Full: `npx vitest run` green · `npx tsc --noEmit` clean.

- [ ] **Step 9: Commit**
```bash
git add app/src/components/DeskSwitch.tsx app/src/components/Sidebar.tsx app/src/components/MobileBottomNav.tsx app/src/components/AppShell.tsx app/src/screens/ExportFilesList.tsx app/src/test/deskNav.test.tsx
git commit -m "feat(export): Import<->Export desk switcher, nav swap, Export Desk title"
```

---

### Task 4: Deferred Phase-1 minors

**Files:**
- Modify: `app/src/screens/ExportFileDetail.tsx` (minors #1, #2), `app/src/data/exportSeed.ts` (minor #3)
- Test: `app/src/test/exportRender.test.tsx` (extend for #1)

**Interfaces:** none new.

- [ ] **Step 1: Read** `ExportFileDetail.tsx` (tab-body switch + Summary aside alert rendering) and `exportSeed.ts`.

- [ ] **Step 2: Minor #1 — payments blank-flip fallback.** In `ExportFileDetail.tsx`, where the active `tab` selects the body: if `tab === 'payments'` and `!RolePolicy.canSeeFinancials(role)` (or more generally the active tab isn't in the role-permitted tab set), render the Summary body instead of nothing. Compute the permitted tab set once and derive an `effectiveTab` that falls back to `'summary'` when `tab` isn't permitted; render by `effectiveTab`.

- [ ] **Step 3: Minor #2 — missing-doc double-surface.** In the Summary aside, the `gatePending` callout already lists missing gate docs. Change the alert list rendered beside it to exclude `kind === 'missing'`: `exportFileAlerts(file).filter((a) => a.kind !== 'missing')`.

- [ ] **Step 4: Minor #3 — seed a payable.** In `exportSeed.ts`, add ONE payable `ExportPayment` to a suitable file (e.g. `{ type: 'freight', direction: 'payable', currency: 'USD', usd: 900, rate: 83, inr: 74700, due: '2026-06-20', paid: null, status: 'pending', ref: 'FRT-E-2201' }` — match the exact `ExportPayment` shape in `types/index.ts`). Pick a file whose derived status does NOT depend on payables (any non-terminal file); payables never gate, so status is unchanged — but re-run the derive test to confirm.

- [ ] **Step 5: Extend test (#1)** — in `exportRender.test.tsx`, add: rendering `ExportFileDetail` for a file as `import_manager` with the URL/tab set to payments shows Summary content (e.g. the "Shipment" heading), not an empty body. (Reuse the existing role-injection helper added in the §0 guard test.)

- [ ] **Step 6: Run + verify** — `npx vitest run` all green (incl. deriveExport + exportRender) · `npx tsc --noEmit` clean · `npm run build` clean.

- [ ] **Step 7: Commit**
```bash
git add app/src/screens/ExportFileDetail.tsx app/src/data/exportSeed.ts app/src/test/exportRender.test.tsx
git commit -m "fix(export): payments-tab fallback, dedupe missing-doc alert, seed a payable"
```

---

## Self-review (against spec)
- A rebrand: label `Export Files` (T1), title `Export Desk` (T3). ✓
- B switcher: DeskProvider+sync (T2), DeskSwitch+nav swap (T3). ✓
- Minors 1/2/3 (T4). ✓
- Testing: navFor unit (T1), DeskProvider (T2), Sidebar desk-scope render (T3), payments-fallback (T4). ✓
- No derive/store behavior change; §0 gating untouched; routes unchanged. ✓
