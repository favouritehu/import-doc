import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const documents: FastifyPluginAsync = async (app) => {
  app.post('/:id/upload', async (_req, reply) => notImplemented(reply, 'upload via StorageService'));
  app.post('/:id/approve', async (_req, reply) => notImplemented(reply, 'approve (Accountant/Owner only)'));
  app.post('/:id/discrepant', async (_req, reply) => notImplemented(reply, 'flag discrepancy + reason'));
  app.post('/:id/request-correction', async (_req, reply) => notImplemented(reply, 'notify supplier'));
};
