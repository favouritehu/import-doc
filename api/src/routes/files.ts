import type { FastifyPluginAsync } from 'fastify';
import { notImplemented } from './_stub';

export const files: FastifyPluginAsync = async (app) => {
  app.get('/', async (_req, reply) => notImplemented(reply, 'list import files'));
  app.post('/', async (_req, reply) => notImplemented(reply, 'create import file (assigns file_number)'));
  app.get('/:id', async (_req, reply) => notImplemented(reply, 'get import file with line items'));
  app.patch('/:id', async (_req, reply) => notImplemented(reply, 'update file / status_manual'));
  app.post('/:id/line-items', async (_req, reply) => notImplemented(reply, 'add invoice line item'));
};
