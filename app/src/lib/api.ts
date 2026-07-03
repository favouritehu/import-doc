// Files API client (Phase B shared data). Holds the shared-password bearer token
// and talks to the same api/ that serves the AI routes. When the server has no DB
// it returns 503 -> ApiError('unconfigured') and the store falls back to IndexedDB.
//
// The token also guards the AI routes, so ai.ts pulls authHeader() from here.

import type { ImportFile } from '../types';
import type { SyncPlan, SyncFailures } from './sync';

const API = ((import.meta.env.VITE_API_URL as string) || 'http://localhost:8787').replace(/\/$/, '');

const TOKEN_KEY = 'import-desk-token';
export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function setToken(t: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    /* ignore */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
export function authHeader(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

export type ApiErrorKind = 'network' | 'unconfigured' | 'unauthorized' | 'server';
export class ApiError extends Error {
  kind: ApiErrorKind;
  status?: number;
  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  // Only declare a JSON content-type when we actually send a body. Fastify rejects
  // an EMPTY body when content-type is application/json (400), which broke every
  // bodyless POST — /files/reserve (so create + import failed in server mode) and
  // /tracking/activate-next, /:id/refresh.
  const headers: Record<string, string> = {
    ...authHeader(),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (init?.body != null) headers['content-type'] = 'application/json';
  try {
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('network', 'Cannot reach the server');
  }
  if (res.status === 401) throw new ApiError('unauthorized', 'Unauthorized', 401);
  if (res.status === 503) throw new ApiError('unconfigured', 'Shared data not enabled', 503);
  if (!res.ok) throw new ApiError('server', `Server error ${res.status}`, res.status);
  return res;
}

// ── Auth ────────────────────────────────────────────────────────────────
export async function authStatus(): Promise<{ required: boolean }> {
  try {
    const res = await fetch(`${API}/auth/status`);
    if (!res.ok) return { required: false };
    return (await res.json()) as { required: boolean };
  } catch {
    // API unreachable — treat as no gate so the app still boots (local mode).
    return { required: false };
  }
}

/** Returns the token on success; throws ApiError('unauthorized') on wrong password. */
export async function login(password: string): Promise<string> {
  const res = await req('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
  const j = (await res.json()) as { token: string };
  return j.token ?? '';
}

// ── Files ─────────────────────────────────────────────────────────────────
export async function listFiles(): Promise<ImportFile[]> {
  const res = await req('/files');
  const j = (await res.json()) as { files: ImportFile[] };
  return j.files ?? [];
}

/** Reserve a server-assigned unique id for a new file (collision-free across users). */
export async function reserveId(): Promise<number> {
  const res = await req('/files/reserve', { method: 'POST' });
  const j = (await res.json()) as { id: number };
  return j.id;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1)); // strip the data: prefix
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Upload a document to server storage. Returns a `srv:<key>` reference to persist
 *  on the doc (bytes live on the volume, not in the DB). Throws on failure so the
 *  caller can fall back to an inline data URL. */
export async function uploadBlob(file: File): Promise<string> {
  const dataBase64 = await fileToBase64(file);
  const res = await req('/files/upload', {
    method: 'POST',
    body: JSON.stringify({ dataBase64, mime: file.type, name: file.name }),
  });
  const j = (await res.json()) as { key: string };
  return `srv:${j.key}`;
}

/** Fetch a `srv:<key>` reference (with auth) as an object URL for preview/download. */
export async function fetchBlobUrl(ref: string): Promise<string> {
  const res = await req(`/files/blob/${ref.slice(4)}`);
  return URL.createObjectURL(await res.blob());
}

// ── Container tracking (Terminal49, slot-limited) ──────────────────────────
export type TrackStatus = 'not_tracked' | 'queued' | 'active' | 'stopped' | 'completed' | 'failed';

export interface TrackedRow {
  local_shipment_id: string;
  import_file_id: number | null;
  bl_number: string | null;
  booking_number: string | null;
  container_number: string | null;
  scac: string | null;
  request_type: string | null;
  request_number: string | null;
  terminal49_shipment_id: string | null;
  terminal49_status: TrackStatus;
  last_event_at: string | null;
  last_event_snapshot: TrackSnapshot | null;
  started_tracking_at: string | null;
  completed_at: string | null;
  failed_reason: string | null;
  created_at: string;
}

export interface TrackSnapshot {
  shippingLine?: string;
  portOfLading?: string;
  portOfDischarge?: string;
  podEta?: string;
  podArrivedAt?: string;
  vessel?: string;
  status?: string;
  containers?: { number?: string; podDischargedAt?: string; availableForPickup?: boolean; lastFreeDay?: string }[];
}

export interface TrackSummary {
  limit: number;
  active: number;
  queued: number;
  stopped: number;
  completed: number;
  failed: number;
  not_tracked: number;
}

export interface TrackInput {
  blNumber?: string;
  bookingNumber?: string;
  containerNumber?: string;
  scac: string;
  importFileId?: number;
}

export async function listTracking(): Promise<{ summary: TrackSummary; rows: TrackedRow[] }> {
  const res = await req('/tracking');
  return (await res.json()) as { summary: TrackSummary; rows: TrackedRow[] };
}

export async function addTracking(input: TrackInput): Promise<TrackedRow> {
  const res = await req('/tracking', { method: 'POST', body: JSON.stringify(input) });
  return ((await res.json()) as { row: TrackedRow }).row;
}

export async function stopTracking(id: string, status: 'stopped' | 'completed' = 'stopped'): Promise<TrackedRow> {
  const res = await req(`/tracking/${id}/stop`, { method: 'POST', body: JSON.stringify({ status }) });
  return ((await res.json()) as { row: TrackedRow }).row;
}

export async function refreshTracking(id: string): Promise<TrackedRow> {
  const res = await req(`/tracking/${id}/refresh`, { method: 'POST' });
  return ((await res.json()) as { row: TrackedRow }).row;
}

export async function activateNextTracking(): Promise<{ started: number; summary: TrackSummary }> {
  const res = await req('/tracking/activate-next', { method: 'POST' });
  return (await res.json()) as { started: number; summary: TrackSummary };
}

/** Start (or fetch existing) tracking for an import file — BL-driven, deduped per file. */
export async function trackFromFile(input: {
  importFileId: number;
  blNumber?: string;
  bookingNumber?: string;
  containerNumber?: string;
  scac: string;
}): Promise<TrackedRow> {
  const res = await req('/tracking/from-file', { method: 'POST', body: JSON.stringify(input) });
  return ((await res.json()) as { row: TrackedRow }).row;
}

/** Remove a tracking row entirely (active rows are stopped on Terminal49 first). */
export async function deleteTracking(id: string): Promise<void> {
  await req(`/tracking/${id}`, { method: 'DELETE' });
}

/** The tracking status for one import file, or null if not tracked. */
export async function trackingForFile(fileId: number): Promise<TrackedRow | null> {
  const res = await req(`/tracking/for-file/${fileId}`);
  return ((await res.json()) as { row: TrackedRow | null }).row;
}

export async function putFile(f: ImportFile): Promise<void> {
  await req(`/files/${f.id}`, { method: 'PUT', body: JSON.stringify(f) });
}

export async function deleteFileRemote(id: number): Promise<void> {
  await req(`/files/${id}`, { method: 'DELETE' });
}

/**
 * Best-effort fire-and-forget flush for pagehide/tab-close: keepalive lets the
 * request outlive the page. Bodies over ~64KB are silently rejected by browsers'
 * keepalive budget — acceptable for a last-gasp flush (the normal sync path
 * retries on next load via the unchanged baseline).
 */
export function flushPlanKeepalive(plan: SyncPlan<ImportFile>): void {
  try {
    for (const f of plan.upserts) {
      void fetch(`${API}/files/${f.id}`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'content-type': 'application/json', ...authHeader() },
        body: JSON.stringify(f),
      }).catch(() => {});
    }
    for (const id of plan.deletes) {
      void fetch(`${API}/files/${id}`, {
        method: 'DELETE',
        keepalive: true,
        headers: { ...authHeader() },
      }).catch(() => {});
    }
  } catch {
    /* best-effort only */
  }
}

/** Bulk upsert local data onto the server ("import my local data"). */
export async function importFiles(files: ImportFile[]): Promise<number> {
  const res = await req('/files/import', { method: 'POST', body: JSON.stringify({ files }) });
  const j = (await res.json()) as { imported: number };
  return j.imported ?? 0;
}

/**
 * Execute a diff plan, returning the ids that FAILED (so the store can keep them
 * out of the advanced baseline and retry). Never throws — collects failures.
 * `unauthorized` flags a 401 so the store can re-auth instead of retrying forever.
 */
export async function runSyncPlan(
  plan: SyncPlan<ImportFile>,
): Promise<SyncFailures & { unauthorized: boolean }> {
  const failed: SyncFailures & { unauthorized: boolean } = {
    upserts: [],
    deletes: [],
    unauthorized: false,
  };
  const track = (e: unknown) => {
    if (e instanceof ApiError && e.kind === 'unauthorized') failed.unauthorized = true;
  };
  await Promise.all([
    ...plan.upserts.map((f) =>
      putFile(f).catch((e) => {
        failed.upserts.push(f.id);
        track(e);
      }),
    ),
    ...plan.deletes.map((id) =>
      deleteFileRemote(id).catch((e) => {
        failed.deletes.push(id);
        track(e);
      }),
    ),
  ]);
  return failed;
}
