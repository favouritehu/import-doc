// Import-file CRUD — Phase B shared store (Postgres JSONB, one row per file).
// When DATABASE_URL is unset every route 503s and the app falls back to IndexedDB.

import type { FastifyPluginAsync } from 'fastify';
import { DbNotConfigured } from '../db';
import { listFiles, upsertFile, deleteFile, upsertMany, type StoredFile } from '../services/filesRepo';

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
