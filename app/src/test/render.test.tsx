import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { StoreProvider } from '../store/store';
import { SEED_FILES } from '../data/seed';
import { Dashboard } from '../screens/Dashboard';
import { FilesList } from '../screens/FilesList';
import { FileDetail } from '../screens/FileDetail';

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
  it('Dashboard surfaces file numbers + the demurrage alert', () => {
    const html = render(<Dashboard />);
    expect(html).toContain('Dashboard');
    expect(html).toContain('IMP-25-0001');
    expect(html).toContain('Demurrage risk');
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
