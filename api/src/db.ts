// Postgres connection. Phase B shared-data store. The whole app persists a single
// ImportFile[] aggregate, so we store one JSONB row per file (id = file id) — no
// 14-table normalization (that's Phase C if reporting ever needs SQL).
//
// DATABASE_URL unset => not configured: every repo call throws DbNotConfigured, the
// routes turn that into 503, and the app falls back to IndexedDB. So local dev with
// no DB still works (per-browser); prod with DATABASE_URL set = shared.

import { Pool } from 'pg';

export class DbNotConfigured extends Error {
  constructor() {
    super('db_not_configured');
    this.name = 'DbNotConfigured';
  }
}

let pool: Pool | null = null;
let ensured = false;

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL;
}

function getPool(): Pool {
  if (!dbConfigured()) throw new DbNotConfigured();
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Coolify-internal Postgres is plain (same Docker network). Set DATABASE_SSL=1
      // only for an external TLS endpoint.
      ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
      max: 5,
    });
  }
  return pool;
}

/** Create the table on first use. Idempotent — safe to call before every query batch. */
export async function ensureSchema(): Promise<void> {
  if (ensured) return;
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS import_files (
      id         INTEGER PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  ensured = true;
}

export async function query<R extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: R[] }> {
  await ensureSchema();
  return getPool().query(text, params) as Promise<{ rows: R[] }>;
}

export async function withTx<T>(fn: (q: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn((text, params) => client.query(text, params));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
