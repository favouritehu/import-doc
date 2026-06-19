import type { FastifyPluginAsync } from 'fastify';

export const health: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok', phase: 'A', service: 'import-desk-api' }));
};
