import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const accessLinks: FastifyPluginAsync = async (app) => {
  app.post('/:id', async (_req, reply) => notImplemented(reply, 'generate signed, revocable magic token'));
  app.post('/:token/revoke', async (_req, reply) => notImplemented(reply, 'revoke token'));
  app.get('/resolve/:token', async (_req, reply) => notImplemented(reply, 'resolve scoped external view'));
};
