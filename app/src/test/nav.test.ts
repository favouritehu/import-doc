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
