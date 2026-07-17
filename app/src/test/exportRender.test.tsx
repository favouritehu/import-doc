import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { StoreProvider } from '../store/store';
import { ExportStoreProvider } from '../store/exportStore';
import { SEED_FILES, USERS } from '../data/seed';
import { EXPORT_SAMPLE_FILES } from '../data/exportSeed';
import { ExportFilesList } from '../screens/ExportFilesList';
import { ExportFileDetail } from '../screens/ExportFileDetail';
import type { Role } from '../types';
import { exportValueInr, inr } from '../lib/format';

// jsdom ships no matchMedia; useIsMobile reads it on first render. Stub desktop.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
  }

  // This Node/Vitest combo ships an experimental global `localStorage` that
  // shadows jsdom's window.localStorage getter and throws without a
  // --localstorage-file flag, leaving window.localStorage effectively unusable
  // here. store.tsx's loadUser()/signIn() already swallow that (try/catch —
  // production just falls back to role 'admin'), which is why no prior test
  // needed a working localStorage. To exercise the app's real sign-in path
  // (persisting a user to localStorage['import-desk-user']) for a role test,
  // install a minimal in-memory Storage shim — a test-environment fix, not an
  // app or gating change.
  let usable = true;
  try {
    window.localStorage.setItem('__probe__', '1');
    window.localStorage.removeItem('__probe__');
  } catch {
    usable = false;
  }
  if (!usable) {
    const mem = new Map<string, string>();
    const shim = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    } as Storage;
    Object.defineProperty(window, 'localStorage', { value: shim, writable: true, configurable: true });
  }
});

// ExportStoreProvider shares role/user with StoreProvider (see main.tsx), so it
// must be nested inside one here too — it throws otherwise. TopBar (rendered by
// both export screens) also reads useStore() directly for alert badges.
function render(ui: ReactNode, route = '/exports'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider initialFiles={SEED_FILES}>
        <ExportStoreProvider initialFiles={EXPORT_SAMPLE_FILES}>{ui}</ExportStoreProvider>
      </StoreProvider>
    </MemoryRouter>,
  );
}

// StoreProvider derives `role` from the signed-in `user` (role = user?.role ?? 'admin'),
// hydrated once per mount via loadUser() reading localStorage['import-desk-user']. That's
// the real "OAuth stand-in" sign-in path the app already uses (see store.tsx `signIn`) — so
// forcing a role here for a test is done by seeding that same localStorage key with a real
// USERS entry, not by adding a test-only prop.
const USER_KEY = 'import-desk-user';

afterEach(() => {
  window.localStorage.removeItem(USER_KEY);
});

function renderAsRole(role: Role, ui: ReactNode, route = '/exports'): string {
  const user = USERS.find((u) => u.role === role);
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(USER_KEY);
  return render(ui, route);
}

describe('export screens render with seed data (no runtime throw)', () => {
  it('ExportFilesList lists seeded buyers and status', () => {
    const html = render(<ExportFilesList />);
    expect(html).toContain('Export Desk');
    expect(html).toContain('Hamburg Organic GmbH'); // e1 buyer
    expect(html).toContain('Customs Cleared'); // exportStatusMeta label for e1
  });

  it('ExportFileDetail renders a single-invoice file (customs_cleared) with buyer + status', () => {
    const html = render(
      <Routes>
        <Route path="/exports/:id" element={<ExportFileDetail />} />
      </Routes>,
      '/exports/1',
    );
    expect(html).toContain('EXP-25-0001');
    expect(html).toContain('Hamburg Organic GmbH');
    expect(html).toContain('Customs Cleared');
  });

  it('ExportFileDetail renders the multi-invoice file with a +N buyer label', () => {
    const html = render(
      <Routes>
        <Route path="/exports/:id" element={<ExportFileDetail />} />
      </Routes>,
      '/exports/4',
    );
    expect(html).toContain('EXP-25-0004');
    expect(html).toContain('+1'); // "Rotterdam Pulp Traders BV +1" — two distinct buyers
  });

  it('exercises exportFileAlerts via a discrepant seed file (e2) surfacing the buyer in Summary', () => {
    const html = render(
      <Routes>
        <Route path="/exports/:id" element={<ExportFileDetail />} />
      </Routes>,
      '/exports/2',
    );
    expect(html).toContain('Discrepant document');
    expect(html).toContain('Dubai Fresh Trading LLC'); // alert detail names the owning buyer
  });
});

describe('§0 financial gating on export screens (rolePolicy.canSeeFinancials/canSeeHsn — finance = accountant/admin only)', () => {
  it('import_manager sees no financial field on ExportFileDetail (invoice value, Payments tab, HSN)', () => {
    const html = renderAsRole(
      'import_manager',
      <Routes>
        <Route path="/exports/:id" element={<ExportFileDetail />} />
      </Routes>,
      '/exports/1',
    );
    expect(html).not.toContain('Invoice value'); // header INR figure, gated by canFin
    expect(html).not.toContain('Payments'); // tab only rendered when canFin
    expect(html).not.toContain('HSN 20089990'); // e1 invoice HSN, gated by canHsn
    expect(html).toContain('Financials hidden'); // the canFin=false placeholder that replaces it
  });

  it('admin sees the same financial fields on the same file, proving the assertion discriminates by role', () => {
    const html = renderAsRole(
      'admin',
      <Routes>
        <Route path="/exports/:id" element={<ExportFileDetail />} />
      </Routes>,
      '/exports/1',
    );
    expect(html).toContain('Invoice value');
    expect(html).toContain('Payments');
    expect(html).toContain('HSN 20089990');
    expect(html).not.toContain('Financials hidden');
  });

  it('import_manager on a payments-tab URL falls back to Summary body instead of rendering blank (effectiveTab guard)', () => {
    const html = renderAsRole(
      'import_manager',
      <Routes>
        <Route path="/exports/:id" element={<ExportFileDetail />} />
      </Routes>,
      '/exports/1?tab=payments',
    );
    expect(html).toContain('Shipment'); // SummaryTab heading — proves the body fell back, not blank
    expect(html).not.toContain('Payments'); // still no Payments tab/body for this role
  });

  it('import_manager sees no INR value on ExportFilesList cards (ExportFilesList gates showInr via canSeeFinancials)', () => {
    const e1Value = inr(exportValueInr(EXPORT_SAMPLE_FILES.find((f) => f.id === 1)!)); // e1's INR figure
    const managerHtml = renderAsRole('import_manager', <ExportFilesList />);
    expect(managerHtml).not.toContain(e1Value);

    const adminHtml = renderAsRole('admin', <ExportFilesList />);
    expect(adminHtml).toContain(e1Value); // proves the assertion discriminates by role
  });
});
