import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const reports: FastifyPluginAsync = async (app) => {
  app.get('/summary', async (_req, reply) => notImplemented(reply, 'supplier-wise rollup (financial-gated)'));
  app.get('/export.csv', async (_req, reply) => notImplemented(reply, 'CSV export'));
};
