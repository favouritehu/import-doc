import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const notes: FastifyPluginAsync = async (app) => {
  app.post('/:id', async (_req, reply) => notImplemented(reply, 'add note'));
};
