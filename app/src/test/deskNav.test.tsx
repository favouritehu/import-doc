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
