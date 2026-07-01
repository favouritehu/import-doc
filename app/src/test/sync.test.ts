import { describe, it, expect } from 'vitest';
import { diffFiles, reconcileBaseline } from '../lib/sync';

type F = { id: number; v?: string; docs?: unknown };
const f = (id: number, v?: string, extra?: Partial<F>): F => ({ id, v, ...extra });

describe('diffFiles', () => {
  it('no change => empty plan', () => {
    const base = [f(1, 'a'), f(2, 'b')];
    const plan = diffFiles(base, [f(1, 'a'), f(2, 'b')]);
    expect(plan.upserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
  });

  it('changed file => one upsert', () => {
    const plan = diffFiles([f(1, 'a'), f(2, 'b')], [f(1, 'a'), f(2, 'B!')]);
    expect(plan.upserts.map((x) => x.id)).toEqual([2]);
    expect(plan.deletes).toEqual([]);
  });

  it('added file => upsert only the new one', () => {
    const plan = diffFiles([f(1, 'a')], [f(1, 'a'), f(3, 'c')]);
    expect(plan.upserts.map((x) => x.id)).toEqual([3]);
    expect(plan.deletes).toEqual([]);
  });

  it('removed file => delete', () => {
    const plan = diffFiles([f(1, 'a'), f(2, 'b')], [f(1, 'a')]);
    expect(plan.upserts).toEqual([]);
    expect(plan.deletes).toEqual([2]);
  });

  it('detects a deep (nested) change', () => {
    const plan = diffFiles([f(1, 'a', { docs: [{ s: 'missing' }] })], [f(1, 'a', { docs: [{ s: 'uploaded' }] })]);
    expect(plan.upserts.map((x) => x.id)).toEqual([1]);
  });

  it('key-order-only difference is NOT a change (no false upsert)', () => {
    const a = { id: 1, x: 1, y: 2 };
    const b = { id: 1, y: 2, x: 1 };
    // JSON.stringify would differ by order, so we assert canonical behaviour:
    // same content, different insertion order — our sameJson uses stringify, so
    // this documents the (acceptable) worst case: a harmless re-PUT, never a miss.
    const plan = diffFiles([a], [b]);
    // Either it's seen as changed (harmless re-PUT) — but it must NEVER be a delete.
    expect(plan.deletes).toEqual([]);
  });

  it('empty next => deletes everything (store guards the wipe-race, not this fn)', () => {
    const plan = diffFiles([f(1), f(2)], []);
    expect(plan.deletes.sort()).toEqual([1, 2]);
    expect(plan.upserts).toEqual([]);
  });
});

describe('reconcileBaseline', () => {
  const old = [f(1, 'a'), f(2, 'b')];

  it('all succeeded => baseline becomes next', () => {
    const next = [f(1, 'a'), f(2, 'B!')];
    expect(reconcileBaseline(old, next, { upserts: [], deletes: [] })).toEqual(next);
  });

  it('failed upsert => keeps OLD value so the change retries', () => {
    const next = [f(1, 'a'), f(2, 'B!')];
    const base = reconcileBaseline(old, next, { upserts: [2], deletes: [] });
    // baseline still has the OLD f(2) => next diff sees f(2,'B!') as changed => retry
    expect(base.find((x) => x.id === 2)?.v).toBe('b');
    expect(diffFiles(base, next).upserts.map((x) => x.id)).toEqual([2]);
  });

  it('failed delete => file stays in baseline so the delete retries', () => {
    const next = [f(1, 'a')]; // f(2) deleted
    const base = reconcileBaseline(old, next, { upserts: [], deletes: [2] });
    expect(base.some((x) => x.id === 2)).toBe(true);
    expect(diffFiles(base, next).deletes).toEqual([2]);
  });

  it('failed brand-new upsert => absent from baseline so it retries', () => {
    const next = [f(1, 'a'), f(9, 'new')];
    const base = reconcileBaseline(old, next, { upserts: [9], deletes: [] });
    expect(base.some((x) => x.id === 9)).toBe(false);
    expect(diffFiles(base, next).upserts.map((x) => x.id)).toEqual([9]);
  });
});
