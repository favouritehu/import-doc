// Import-file aggregate repo. The API is a dumb JSONB store — the app owns the
// ImportFile shape; here a file is just an object with a numeric `id`. Newest
// first (higher id = newer). All calls throw DbNotConfigured when DATABASE_URL is
// unset (routes -> 503 -> app falls back to IndexedDB).

import { query, withTx } from '../db';

export type StoredFile = { id: number } & Record<string, unknown>;

/** Reserve a fresh, globally-unique file id (monotonic sequence). No row inserted;
 *  the client fills it via PUT. Prevents the "everyone starts at id=1" collision.
 *
 *  The sequence is first bumped past MAX(id) in the table: imported local data and
 *  legacy rows carry client-assigned ids the sequence never saw — without the bump
 *  a later reserve could hand out an id that already exists and the PUT (an
 *  upsert) would silently overwrite someone's file. */
export async function reserveId(): Promise<number> {
  await query(
    `SELECT setval('import_files_id_seq',
       GREATEST((SELECT COALESCE(MAX(id), 0) FROM import_files),
                (SELECT last_value FROM import_files_id_seq)),
       true)`,
  );
  const { rows } = await query<{ id: number }>("SELECT nextval('import_files_id_seq')::int AS id");
  return rows[0].id;
}

export async function listFiles(): Promise<StoredFile[]> {
  const { rows } = await query<{ data: StoredFile }>('SELECT data FROM import_files ORDER BY id DESC');
  return rows.map((r) => r.data);
}

export async function upsertFile(file: StoredFile): Promise<void> {
  if (typeof file?.id !== 'number') throw new Error('file.id must be a number');
  await query(
    `INSERT INTO import_files (id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [file.id, JSON.stringify(file)],
  );
}

export async function deleteFile(id: number): Promise<void> {
  await query('DELETE FROM import_files WHERE id = $1', [id]);
}

/** Bulk upsert (used by "import my local data"). One transaction, no deletes. */
export async function upsertMany(files: StoredFile[]): Promise<number> {
  const valid = files.filter((f) => typeof f?.id === 'number');
  if (valid.length === 0) return 0;
  await withTx(async (q) => {
    for (const f of valid) {
      await q(
        `INSERT INTO import_files (id, data, updated_at) VALUES ($1, $2, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [f.id, JSON.stringify(f)],
      );
    }
  });
  return valid.length;
}
