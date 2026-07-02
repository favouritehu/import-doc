// Import-file CRUD — Phase B shared store (Postgres JSONB, one row per file).
// When DATABASE_URL is unset every route 503s and the app falls back to IndexedDB.

import type { FastifyPluginAsync } from 'fastify';
import { DbNotConfigured } from '../db';
import { listFiles, upsertFile, deleteFile, upsertMany, reserveId, type StoredFile } from '../services/filesRepo';
import { putObject, readObject, validKey } from '../services/storage';

function dbGuard(reply: import('fastify').FastifyReply, e: unknown): boolean {
  if (e instanceof DbNotConfigured) {
    reply.code(503).send({ error: 'db_not_configured', detail: 'Set DATABASE_URL to enable shared data.' });
    return true;
  }
  return false;
}

export const files: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    try {
      return { files: await listFiles() };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });

  // Store an uploaded document on the volume; the DB keeps only the returned key
  // (`srv:<key>`), so file bytes never bloat the JSONB rows.
  app.post<{ Body: { dataBase64?: string; mime?: string; name?: string } }>('/upload', async (req, reply) => {
    const { dataBase64, mime, name } = req.body ?? {};
    if (!dataBase64) return reply.code(400).send({ error: 'bad_request', detail: 'dataBase64 required' });
    try {
      const { key } = await putObject(dataBase64, mime ?? 'application/octet-stream', name ?? '');
      return { key };
    } catch (e) {
      return reply.code(500).send({ error: 'storage_error', detail: (e as Error).message });
    }
  });

  // Stream a stored document back. Guarded by the /files auth hook, so the app
  // fetches it with the bearer token and turns it into an object URL.
  app.get<{ Params: { key: string } }>('/blob/:key', async (req, reply) => {
    const { key } = req.params;
    if (!validKey(key)) return reply.code(400).send({ error: 'bad_key' });
    try {
      const { stream, size, contentType } = await readObject(key);
      reply.header('Content-Type', contentType);
      reply.header('Content-Length', size);
      reply.header('Cache-Control', 'private, max-age=31536000, immutable');
      return reply.send(stream);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });

  // Reserve a unique id before building a new file (server-assigned, collision-free).
  app.post('/reserve', async (_req, reply) => {
    try {
      return { id: await reserveId() };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });

  app.put<{ Params: { id: string }; Body: StoredFile }>('/:id', async (req, reply) => {
    try {
      const id = Number(req.params.id);
      const body = req.body;
      if (!body || typeof body !== 'object' || Number(body.id) !== id) {
        return reply.code(400).send({ error: 'bad_request', detail: 'body.id must match :id' });
      }
      await upsertFile({ ...body, id });
      return { ok: true };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await deleteFile(Number(req.params.id));
      return { ok: true };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });

  // Bulk upsert — "import my local data to server". No deletes.
  app.post<{ Body: { files: StoredFile[] } }>('/import', async (req, reply) => {
    try {
      const list = Array.isArray(req.body?.files) ? req.body.files : [];
      const n = await upsertMany(list);
      return { ok: true, imported: n };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });
};
