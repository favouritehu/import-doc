// Cost-efficient container tracking: unlimited shipments stored locally, but at
// most ACTIVE_LIMIT (10) live-tracked on Terminal49 at once. New entries beyond the
// limit are `queued`; when an active one is stopped/completed a queued one is
// auto-activated (oldest first). All Terminal49 side effects funnel through here.

import { query } from '../db';
import {
  createTrackingRequest,
  getTrackingRequest,
  getShipmentSnapshot,
  stopShipmentTracking,
  t49Configured,
  type RequestType,
  type ShipmentSnapshot,
} from './terminal49';

export const ACTIVE_LIMIT = (): number => Number(process.env.TERMINAL49_ACTIVE_LIMIT || 10);

export type T49Status = 'not_tracked' | 'queued' | 'active' | 'stopped' | 'completed' | 'failed';

export interface TrackedRow {
  local_shipment_id: string;
  import_file_id: number | null;
  bl_number: string | null;
  booking_number: string | null;
  container_number: string | null;
  scac: string | null;
  request_type: string | null;
  request_number: string | null;
  terminal49_tracking_request_id: string | null;
  terminal49_shipment_id: string | null;
  terminal49_container_id: string | null;
  terminal49_status: T49Status;
  last_event_at: string | null;
  last_event_snapshot: unknown;
  started_tracking_at: string | null;
  stopped_tracking_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  created_at: string;
  updated_at: string;
  [k: string]: unknown; // satisfies the query<Record<string, unknown>> constraint
}

let ensured = false;
export async function ensureTrackingSchema(): Promise<void> {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS tracked_shipments (
      local_shipment_id              TEXT PRIMARY KEY,
      import_file_id                 INTEGER,
      bl_number                      TEXT,
      booking_number                 TEXT,
      container_number               TEXT,
      scac                           TEXT,
      request_type                   TEXT,
      request_number                 TEXT,
      terminal49_tracking_request_id TEXT,
      terminal49_shipment_id         TEXT,
      terminal49_container_id        TEXT,
      terminal49_status              TEXT NOT NULL DEFAULT 'not_tracked',
      last_event_at                  TIMESTAMPTZ,
      last_event_snapshot            JSONB,
      started_tracking_at            TIMESTAMPTZ,
      stopped_tracking_at            TIMESTAMPTZ,
      completed_at                   TIMESTAMPTZ,
      failed_reason                  TEXT,
      created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  ensured = true;
}

// ── pure helpers (unit-tested) ────────────────────────────────────────────

export interface TrackInput {
  blNumber?: string;
  bookingNumber?: string;
  containerNumber?: string;
  scac: string;
  importFileId?: number;
}

/** Input priority: Master BL > booking > container. Returns null if nothing given. */
export function pickRequest(input: TrackInput): { requestType: RequestType; requestNumber: string } | null {
  const bl = input.blNumber?.trim();
  const bk = input.bookingNumber?.trim();
  const cn = input.containerNumber?.trim();
  if (bl) return { requestType: 'bill_of_lading', requestNumber: bl };
  if (bk) return { requestType: 'booking_number', requestNumber: bk };
  if (cn) return { requestType: 'container', requestNumber: cn };
  return null;
}

/** Can we open a new live slot? */
export function hasFreeSlot(activeCount: number, limit: number): boolean {
  return activeCount < limit;
}

// ── DB ops ────────────────────────────────────────────────────────────────

export async function activeCount(): Promise<number> {
  await ensureTrackingSchema();
  const { rows } = await query<{ n: string }>(
    "SELECT count(*)::int AS n FROM tracked_shipments WHERE terminal49_status = 'active'",
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listTracked(): Promise<TrackedRow[]> {
  await ensureTrackingSchema();
  const { rows } = await query<TrackedRow>('SELECT * FROM tracked_shipments ORDER BY created_at DESC');
  return rows;
}

export async function getRow(id: string): Promise<TrackedRow | null> {
  await ensureTrackingSchema();
  const { rows } = await query<TrackedRow>('SELECT * FROM tracked_shipments WHERE local_shipment_id = $1', [id]);
  return rows[0] ?? null;
}

/** The tracking row linked to an import file (if any). */
export async function getByFileId(fileId: number): Promise<TrackedRow | null> {
  await ensureTrackingSchema();
  const { rows } = await query<TrackedRow>(
    'SELECT * FROM tracked_shipments WHERE import_file_id = $1 ORDER BY created_at DESC LIMIT 1',
    [fileId],
  );
  return rows[0] ?? null;
}

/** Track a shipment straight from its import file — deduped per file so re-saving
 *  the file doesn't create duplicates. A failed row retries — and if the user
 *  supplies a DIFFERENT number/carrier, the row is updated first so "edit & retry"
 *  works instead of re-failing on the old input forever. */
export async function trackByFile(input: TrackInput & { importFileId: number }): Promise<TrackedRow> {
  const existing = await getByFileId(input.importFileId);
  if (existing) {
    if (existing.terminal49_status === 'failed' || existing.terminal49_status === 'not_tracked') {
      const pick = pickRequest(input);
      if (pick && input.scac?.trim()) {
        await query(
          `UPDATE tracked_shipments SET
             bl_number = $2, booking_number = $3, container_number = $4, scac = $5,
             request_type = $6, request_number = $7, updated_at = now()
           WHERE local_shipment_id = $1`,
          [
            existing.local_shipment_id,
            input.blNumber?.trim() || null,
            input.bookingNumber?.trim() || null,
            input.containerNumber?.trim() || null,
            input.scac.trim(),
            pick.requestType,
            pick.requestNumber,
          ],
        );
      }
      return tryActivate((await getRow(existing.local_shipment_id))!);
    }
    return existing; // already active/queued/stopped/completed
  }
  return addTracking(input);
}

export async function summary(): Promise<{
  limit: number;
  active: number;
  queued: number;
  stopped: number;
  completed: number;
  failed: number;
  not_tracked: number;
}> {
  await ensureTrackingSchema();
  const { rows } = await query<{ terminal49_status: T49Status; n: string }>(
    'SELECT terminal49_status, count(*)::int AS n FROM tracked_shipments GROUP BY terminal49_status',
  );
  const by = Object.fromEntries(rows.map((r) => [r.terminal49_status, Number(r.n)]));
  return {
    limit: ACTIVE_LIMIT(),
    active: by.active ?? 0,
    queued: by.queued ?? 0,
    stopped: by.stopped ?? 0,
    completed: by.completed ?? 0,
    failed: by.failed ?? 0,
    not_tracked: by.not_tracked ?? 0,
  };
}

function rid(): string {
  // Time-ordered-ish id without Math.random dependence on a single call.
  return 'trk_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

/** Add a shipment to track. Saves locally, then activates if a slot is free else queues. */
export async function addTracking(input: TrackInput): Promise<TrackedRow> {
  await ensureTrackingSchema();
  const pick = pickRequest(input);
  if (!pick) throw new Error('need a BL, booking or container number');
  if (!input.scac?.trim()) throw new Error('scac (carrier code) is required');
  const id = rid();
  await query(
    `INSERT INTO tracked_shipments
       (local_shipment_id, import_file_id, bl_number, booking_number, container_number, scac,
        request_type, request_number, terminal49_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'not_tracked')`,
    [
      id,
      input.importFileId ?? null,
      input.blNumber?.trim() || null,
      input.bookingNumber?.trim() || null,
      input.containerNumber?.trim() || null,
      input.scac.trim(),
      pick.requestType,
      pick.requestNumber,
    ],
  );
  const row = await getRow(id);
  return tryActivate(row!);
}

/** Activate a not_tracked/queued row if a live slot is free, else mark queued. */
export async function tryActivate(row: TrackedRow): Promise<TrackedRow> {
  if (row.terminal49_status === 'active') return row;
  if (!t49Configured()) {
    await setStatus(row.local_shipment_id, 'queued', { failed_reason: 'terminal49_not_configured' });
    return (await getRow(row.local_shipment_id))!;
  }
  if (!hasFreeSlot(await activeCount(), ACTIVE_LIMIT())) {
    await setStatus(row.local_shipment_id, 'queued');
    return (await getRow(row.local_shipment_id))!;
  }
  try {
    const tr = await createTrackingRequest(
      row.request_type as RequestType,
      row.request_number!,
      row.scac!,
    );
    await query(
      `UPDATE tracked_shipments SET
         terminal49_tracking_request_id = $2,
         terminal49_shipment_id = COALESCE($3, terminal49_shipment_id),
         terminal49_status = 'active',
         started_tracking_at = now(), failed_reason = NULL, updated_at = now()
       WHERE local_shipment_id = $1`,
      [row.local_shipment_id, tr.id, tr.shipmentId ?? null],
    );
  } catch (e) {
    await setStatus(row.local_shipment_id, 'failed', { failed_reason: (e as Error).message });
  }
  return (await getRow(row.local_shipment_id))!;
}

async function setStatus(
  id: string,
  status: T49Status,
  extra?: { failed_reason?: string | null },
): Promise<void> {
  await query(
    `UPDATE tracked_shipments SET terminal49_status = $2, failed_reason = $3, updated_at = now()
     WHERE local_shipment_id = $1`,
    [id, status, extra?.failed_reason ?? null],
  );
}

/** Stop live tracking: snapshot latest -> T49 stop_tracking -> mark stopped/completed
 *  -> activate the next queued shipment. Frees a slot without abusing start/stop. */
export async function stopTracking(
  id: string,
  finalStatus: 'stopped' | 'completed' = 'stopped',
): Promise<TrackedRow> {
  const row = await getRow(id);
  if (!row) throw new Error('not_found');
  // 1) Save the latest events BEFORE we stop (best effort).
  if (row.terminal49_shipment_id && t49Configured()) {
    try {
      const snap = await getShipmentSnapshot(row.terminal49_shipment_id);
      await saveSnapshot(id, snap);
    } catch {
      /* keep whatever snapshot we already have */
    }
    // 2) Tell Terminal49 to stop (frees their slot).
    try {
      await stopShipmentTracking(row.terminal49_shipment_id);
    } catch {
      /* even if the stop call fails, we free OUR slot locally so the queue moves */
    }
  }
  // 3) Flip local status.
  const col = finalStatus === 'completed' ? 'completed_at' : 'stopped_tracking_at';
  await query(
    `UPDATE tracked_shipments SET terminal49_status = $2, ${col} = now(), updated_at = now()
     WHERE local_shipment_id = $1`,
    [id, finalStatus],
  );
  // 4) Pull the next queued into the freed slot.
  await activateNext();
  return (await getRow(id))!;
}

/** Fill free slots from the queue, oldest first. */
export async function activateNext(): Promise<number> {
  await ensureTrackingSchema();
  let started = 0;
  while (hasFreeSlot(await activeCount(), ACTIVE_LIMIT())) {
    const { rows } = await query<TrackedRow>(
      "SELECT * FROM tracked_shipments WHERE terminal49_status = 'queued' ORDER BY created_at ASC LIMIT 1",
    );
    const next = rows[0];
    if (!next) break;
    const after = await tryActivate(next);
    if (after.terminal49_status !== 'active') break; // failed/queued again -> stop looping
    started += 1;
  }
  return started;
}

async function saveSnapshot(id: string, snap: ShipmentSnapshot): Promise<void> {
  const c0 = snap.containers[0];
  await query(
    `UPDATE tracked_shipments SET
       terminal49_shipment_id = COALESCE($2, terminal49_shipment_id),
       terminal49_container_id = COALESCE($3, terminal49_container_id),
       last_event_snapshot = $4::jsonb,
       last_event_at = COALESCE($5, last_event_at),
       updated_at = now()
     WHERE local_shipment_id = $1`,
    [id, snap.shipmentId, c0?.containerId ?? null, JSON.stringify(snap), snap.lastEventAt ?? null],
  );
}

// A shipment is DONE (frees its live slot) when its containers are back empty, the
// carrier says delivered, or it arrived more than AUTO_COMPLETE_DAYS ago.
const AUTO_COMPLETE_DAYS = (): number => Number(process.env.TRACKING_AUTO_COMPLETE_DAYS || 7);

function isShipmentDone(snap: ShipmentSnapshot): boolean {
  const status = (snap.status ?? '').toLowerCase();
  if (status.includes('delivered') || status.includes('empty')) return true;
  if (snap.containers.length && snap.containers.every((c) => !!c.emptyReturnedAt)) return true;
  if (snap.podArrivedAt) {
    const arrived = Date.parse(snap.podArrivedAt);
    if (!Number.isNaN(arrived) && Date.now() - arrived > AUTO_COMPLETE_DAYS() * 86_400_000) return true;
  }
  return false;
}

/** Pull the latest from Terminal49 for one row (Refresh / webhook / sweep). When
 *  the shipment is finished, auto-complete it — frees the slot and pulls the next
 *  queued shipment in, so the 10 live slots stay busy without manual cleanup. */
export async function refresh(id: string): Promise<TrackedRow> {
  const row = await getRow(id);
  if (!row) throw new Error('not_found');
  // If we only have a tracking-request id, resolve the shipment id first.
  let shipmentId = row.terminal49_shipment_id;
  if (!shipmentId && row.terminal49_tracking_request_id && t49Configured()) {
    const tr = await getTrackingRequest(row.terminal49_tracking_request_id);
    shipmentId = tr.shipmentId ?? null;
    if (tr.status === 'failed') await setStatus(id, 'failed', { failed_reason: tr.failedReason ?? 'tracking failed' });
  }
  if (shipmentId && t49Configured()) {
    const snap = await getShipmentSnapshot(shipmentId);
    await saveSnapshot(id, snap);
    if (row.terminal49_status === 'active' && isShipmentDone(snap)) {
      return stopTracking(id, 'completed'); // snapshots again, stops on T49, activates next
    }
  }
  return (await getRow(id))!;
}

/** Background sweep: refresh stale/active rows, auto-complete the finished ones,
 *  and fill any free slots from the queue. Called on an interval by the server —
 *  keeps tracking data fresh even when no Terminal49 webhook is registered. */
export async function sweep(): Promise<{ refreshed: number; started: number }> {
  if (!t49Configured()) return { refreshed: 0, started: 0 };
  await ensureTrackingSchema();
  const STALE_MIN = Number(process.env.TRACKING_SWEEP_STALE_MIN || 120);
  const { rows } = await query<TrackedRow>(
    `SELECT * FROM tracked_shipments
     WHERE terminal49_status = 'active'
       AND (last_event_snapshot IS NULL OR updated_at < now() - ($1 || ' minutes')::interval)
     ORDER BY updated_at ASC LIMIT 10`,
    [String(STALE_MIN)],
  );
  let refreshed = 0;
  for (const r of rows) {
    try {
      await refresh(r.local_shipment_id);
      refreshed += 1;
    } catch {
      /* next sweep retries */
    }
  }
  const started = await activateNext();
  return { refreshed, started };
}

/** Remove a row entirely (dead/failed/old). An active row is stopped on T49 first. */
export async function deleteRow(id: string): Promise<void> {
  const row = await getRow(id);
  if (!row) return;
  if (row.terminal49_status === 'active' && row.terminal49_shipment_id && t49Configured()) {
    try {
      await stopShipmentTracking(row.terminal49_shipment_id);
    } catch {
      /* free our slot regardless */
    }
  }
  await query('DELETE FROM tracked_shipments WHERE local_shipment_id = $1', [id]);
  await activateNext();
}

/** Terminal49 webhook: find the row by shipment/container id, refresh its snapshot. */
export async function applyWebhook(shipmentId?: string, containerId?: string): Promise<void> {
  if (!shipmentId && !containerId) return;
  await ensureTrackingSchema();
  const { rows } = await query<TrackedRow>(
    `SELECT * FROM tracked_shipments
     WHERE ($1::text IS NOT NULL AND terminal49_shipment_id = $1)
        OR ($2::text IS NOT NULL AND terminal49_container_id = $2)
     LIMIT 1`,
    [shipmentId ?? null, containerId ?? null],
  );
  const row = rows[0];
  if (!row) return;
  try {
    await refresh(row.local_shipment_id);
  } catch {
    /* webhook is best-effort; a manual Refresh will retry */
  }
}
