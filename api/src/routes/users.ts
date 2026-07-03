// Shared team profiles (guarded by the shared-password hook). 503 when no DB —
// the app then keeps profiles per-device as before.

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { DbNotConfigured } from '../db';
import { listUsers, upsertUser, deleteUser, type StoredUser } from '../services/usersRepo';

function dbGuard(reply: FastifyReply, e: unknown): boolean {
  if (e instanceof DbNotConfigured) {
    reply.code(503).send({ error: 'db_not_configured' });
    return true;
  }
  return false;
}

export const users: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => {
    try {
      return { users: await listUsers() };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });

  app.put<{ Params: { id: string }; Body: StoredUser }>('/:id', async (req, reply) => {
    try {
      const id = Number(req.params.id);
      const body = req.body;
      if (!body || typeof body !== 'object' || Number(body.id) !== id) {
        return reply.code(400).send({ error: 'bad_request', detail: 'body.id must match :id' });
      }
      await upsertUser({ ...body, id });
      return { ok: true };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await deleteUser(Number(req.params.id));
      return { ok: true };
    } catch (e) {
      if (dbGuard(reply, e)) return reply;
      throw e;
    }
  });
};
