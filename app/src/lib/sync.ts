// Diff-based server sync for the files aggregate. The store keeps the whole
// ImportFile[] in memory and mutates it immutably; this computes the minimal set
// of per-file PUT/DELETE calls against a "baseline" (last state known to match the
// server) and reconciles the baseline forward — reverting only the files whose
// sync FAILED so they retry next tick (a failed write must never silently vanish).
//
// Pure + generic (keyed on `id`) so it's unit-tested with no DB and no React.

export interface SyncPlan<T> {
  upserts: T[]; // new or changed since baseline
  deletes: number[]; // ids present in baseline but gone from next
}

export interface SyncFailures {
  upserts: number[]; // ids whose PUT failed
  deletes: number[]; // ids whose DELETE failed
}

/** Minimal PUT/DELETE set to bring the server from `baseline` to `next`. */
export function diffFiles<T extends { id: number }>(baseline: T[], next: T[]): SyncPlan<T> {
  const baseById = new Map(baseline.map((f) => [f.id, f]));
  const nextIds = new Set(next.map((f) => f.id));

  const upserts: T[] = [];
  for (const f of next) {
    const prev = baseById.get(f.id);
    if (!prev || !sameJson(prev, f)) upserts.push(f);
  }

  const deletes: number[] = [];
  for (const f of baseline) if (!nextIds.has(f.id)) deletes.push(f.id);

  return { upserts, deletes };
}

/**
 * New baseline after attempting a plan. Starts from `next` (in-memory truth) but
 * for every FAILED op reverts to the old baseline entry so the next diff re-detects
 * it: a failed upsert stays at its old value (retry the change), a failed delete
 * stays present (retry the delete). Succeeded ops move the baseline forward.
 */
export function reconcileBaseline<T extends { id: number }>(
  oldBaseline: T[],
  next: T[],
  failed: SyncFailures,
): T[] {
  const failedIds = new Set<number>([...failed.upserts, ...failed.deletes]);
  if (failedIds.size === 0) return next;

  const oldById = new Map(oldBaseline.map((f) => [f.id, f]));
  const result = next.filter((f) => !failedIds.has(f.id));
  for (const id of failedIds) {
    const old = oldById.get(id);
    if (old) result.push(old); // no old entry (failed brand-new upsert) => stays absent => retried
  }
  return result;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
