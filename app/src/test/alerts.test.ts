import { describe, expect, it } from 'vitest';
import type { AlertKind, ImportFile } from '../types';
import { SEED_FILES } from '../data/seed';
import { allAlerts, fileAlerts } from '../lib/derive';

const byId = (id: number): ImportFile => structuredClone(SEED_FILES.find((f) => f.id === id)!);

const ORDER: AlertKind[] = [
  'demurrage',
  'eta',
  'approval_required',
  'discrepant',
  'overdue',
  'missing',
];

describe('allAlerts', () => {
  it('is sorted demurrage -> eta -> approval_required -> discrepant -> overdue -> missing', () => {
    const ranks = allAlerts(SEED_FILES).map((a) => ORDER.indexOf(a.kind));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it('surfaces demurrage first when present', () => {
    const all = allAlerts(SEED_FILES);
    expect(all[0].kind).toBe('demurrage');
  });

  it('the dashboard slice(0,2) yields at most two alerts', () => {
    expect(allAlerts(SEED_FILES).slice(0, 2).length).toBeLessThanOrEqual(2);
  });
});

describe('fileAlerts — per kind', () => {
  it('demurrage: arrived + OOC pending (file 1)', () => {
    expect(fileAlerts(byId(1)).some((a) => a.kind === 'demurrage')).toBe(true);
  });

  it('discrepant: names the owning invoice supplier (file 3)', () => {
    const a = fileAlerts(byId(3)).find((x) => x.kind === 'discrepant');
    expect(a).toBeTruthy();
    expect(a!.party).toBe('Bangkok Aseptic Ltd.');
  });

  it('overdue: an overdue payment yields an overdue alert (file 4)', () => {
    expect(fileAlerts(byId(4)).some((a) => a.kind === 'overdue')).toBe(true);
  });

  it('missing: a near-ETA file with a missing required doc (file 2 insurance)', () => {
    expect(fileAlerts(byId(2)).some((a) => a.kind === 'missing')).toBe(true);
  });

  it('eta: file within 3 days with pending docs (file 3)', () => {
    expect(fileAlerts(byId(3)).some((a) => a.kind === 'eta')).toBe(true);
  });

  it('approval_required: a required doc under_review raises an approval alert', () => {
    const f = byId(3);
    f.invoices[0].ci.status = 'under_review';
    f.invoices[0].ci.reason = null;
    expect(fileAlerts(f).some((a) => a.kind === 'approval_required')).toBe(true);
  });
});
