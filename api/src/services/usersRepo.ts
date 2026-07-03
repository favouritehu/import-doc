// Shared team profiles. One JSONB row per user (the app owns the shape: id, name,
// role, initials, email) so a profile created on one device shows up on every
// device — pick your name instead of re-creating it. Same degrade rule as files:
// no DATABASE_URL -> DbNotConfigured -> the app falls back to local profiles.

import { query } from '../db';

export type StoredUser = { id: number } & Record<string, unknown>;

let ensured = false;
async function ensureUsersSchema(): Promise<void> {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id         BIGINT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  ensured = true;
}

export async function listUsers(): Promise<StoredUser[]> {
  await ensureUsersSchema();
  const { rows } = await query<{ data: StoredUser }>('SELECT data FROM app_users ORDER BY id ASC');
  return rows.map((r) => r.data);
}

export async function upsertUser(user: StoredUser): Promise<void> {
  if (typeof user?.id !== 'number') throw new Error('user.id must be a number');
  await ensureUsersSchema();
  await query(
    `INSERT INTO app_users (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [user.id, JSON.stringify(user)],
  );
}

export async function deleteUser(id: number): Promise<void> {
  await ensureUsersSchema();
  await query('DELETE FROM app_users WHERE id = $1', [id]);
}
