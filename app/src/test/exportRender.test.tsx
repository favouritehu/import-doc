import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { StoreProvider } from '../store/store';
import { ExportStoreProvider } from '../store/exportStore';
import { SEED_FILES } from '../data/seed';
import { EXPORT_SEED_FILES } from '../data/exportSeed';
import { ExportFilesList } from '../screens/ExportFilesList';
import { ExportFileDetail } from '../screens/ExportFileDetail';

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
});

// ExportStoreProvider shares role/user with StoreProvider (see main.tsx), so it
// must be nested inside one here too — it throws otherwise. TopBar (rendered by
// both export screens) also reads useStore() directly for alert badges.
function render(ui: ReactNode, route = '/exports'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider initialFiles={SEED_FILES}>
        <ExportStoreProvider initialFiles={EXPORT_SEED_FILES}>{ui}</ExportStoreProvider>
      </StoreProvider>
    </MemoryRouter>,
  );
}

describe('export screens render with seed data (no runtime throw)', () => {
  it('ExportFilesList lists seeded buyers and status', () => {
    const html = render(<ExportFilesList />);
    expect(html).toContain('Export files');
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
