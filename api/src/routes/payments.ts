import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const payments: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => notImplemented(reply, 'list pending payments (financial-gated)'));
  app.post('/', async (_req, reply) => notImplemented(reply, 'add payment'));
  app.post('/:id/mark-paid', async (_req, reply) => notImplemented(reply, 'mark payment paid'));
};
