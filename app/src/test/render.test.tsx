import { beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { StoreProvider } from '../store/store';
import { SEED_FILES } from '../data/seed';
import { Workspace } from '../screens/Workspace';
import { Today } from '../screens/Today';
import { FilesList } from '../screens/FilesList';
import { FileDetail } from '../screens/FileDetail';

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

// SSR render runs no effects, so the store never hydrates from IndexedDB here.
// Inject the seed directly so these smoke tests exercise real data.
function render(ui: ReactNode, route = '/'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider initialFiles={SEED_FILES}>{ui}</StoreProvider>
    </MemoryRouter>,
  );
}

describe('screens render with seed data (no runtime throw)', () => {
  it('Workspace rail leads with party names + IMP ids', () => {
    const html = render(<Workspace />);
    expect(html).toContain('Imports');
    expect(html).toContain('Ningbo Foods Co.'); // party name = the hero
    expect(html).toContain('IMP-25-'); // IMP id stays as the secondary
  });

  it('Today surfaces due items merged across files', () => {
    const html = render(<Today />, '/today');
    expect(html).toContain('Today');
    expect(html).toContain('IMP-25-0001'); // seed file with a demurrage/eta row
  });

  it('FilesList lists seeded suppliers', () => {
    const html = render(<FilesList />);
    expect(html).toContain('Import files');
    expect(html).toContain('Ningbo Foods Co.');
  });

  it('FileDetail renders the multi-invoice file with a +N supplier label', () => {
    const html = render(
      <Routes>
        <Route path="/files/:id" element={<FileDetail />} />
      </Routes>,
      '/files/5',
    );
    expect(html).toContain('IMP-25-0005');
    expect(html).toContain('+1'); // "Ningbo Foods Co. +1" — two distinct suppliers
  });
});
