import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const cha: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => notImplemented(reply, 'cross-file CHA desk'));
  app.post('/:id/step', async (_req, reply) => notImplemented(reply, 'toggle cha_status step (pending/done/na)'));
};
