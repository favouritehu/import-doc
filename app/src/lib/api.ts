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
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...authHeader(), ...(init?.headers ?? {}) },
    });
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

export async function putFile(f: ImportFile): Promise<void> {
  await req(`/files/${f.id}`, { method: 'PUT', body: JSON.stringify(f) });
}

export async function deleteFileRemote(id: number): Promise<void> {
  await req(`/files/${id}`, { method: 'DELETE' });
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
 */
export async function runSyncPlan(plan: SyncPlan<ImportFile>): Promise<SyncFailures> {
  const failed: SyncFailures = { upserts: [], deletes: [] };
  await Promise.all([
    ...plan.upserts.map((f) => putFile(f).catch(() => failed.upserts.push(f.id))),
    ...plan.deletes.map((id) => deleteFileRemote(id).catch(() => failed.deletes.push(id))),
  ]);
  return failed;
}
