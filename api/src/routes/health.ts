import type { FastifyPluginAsync } from 'fastify';
import { dbConfigured, query } from '../db';
import { aiStatus } from '../services/ai';
import { authConfigured } from '../services/auth';
import { t49Configured } from '../services/terminal49';

export const health: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ status: 'ok', phase: 'B', service: 'import-desk-api' }));

  // One unguarded status link — the whole deploy at a glance. Unguarded on purpose
  // so it works even when APP_PASSWORD is set (unlike /ai/status, which sits behind
  // the auth gate). `shared:true` means Postgres is actually connected (this also
  // surfaces the Coolify network-join problem: configured:true + connected:false).
  app.get('/status', async () => {
    let db: { configured: boolean; connected: boolean; error?: string };
    if (!dbConfigured()) {
      db = { configured: false, connected: false };
    } else {
      try {
        await query('SELECT 1');
        db = { configured: true, connected: true };
      } catch (e) {
        db = { configured: true, connected: false, error: (e as Error).message };
      }
    }
    return {
      status: 'ok',
      service: 'import-desk-api',
      shared: db.connected, // true => data is saved + shared via Postgres
      auth: { required: authConfigured() },
      db,
      ai: aiStatus(),
      tracking: { configured: t49Configured() },
    };
  });
};
