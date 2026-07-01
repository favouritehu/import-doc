import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { errorHandler } from './middleware/errorHandler';
import { tokenValid, bearerFrom } from './services/auth';
import { health } from './routes/health';
import { auth } from './routes/auth';
import { files } from './routes/files';
import { documents } from './routes/documents';
import { payments } from './routes/payments';
import { cha } from './routes/cha';
import { notes } from './routes/notes';
import { accessLinks } from './routes/access-links';
import { reports } from './routes/reports';
import { reminders } from './routes/reminders';
import { ai } from './routes/ai';

export async function buildServer(): Promise<FastifyInstance> {
  // 30MB body — base64 of multi-MB invoice PDFs/photos for /ai/extract.
  const app = Fastify({ logger: true, bodyLimit: 30 * 1024 * 1024 });

  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });
  app.setErrorHandler(errorHandler);

  // Shared-password gate: guard data + AI routes. No-op when APP_PASSWORD unset
  // (open mode). Skip CORS preflight (no auth header on OPTIONS).
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    const p = req.url.split('?')[0];
    const guarded = p.startsWith('/files') || p.startsWith('/ai') || p.startsWith('/reminders');
    if (!guarded) return;
    if (!tokenValid(bearerFrom(req.headers.authorization))) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  await app.register(health);
  await app.register(auth, { prefix: '/auth' });
  await app.register(ai, { prefix: '/ai' });
  await app.register(files, { prefix: '/files' });
  await app.register(documents, { prefix: '/documents' });
  await app.register(payments, { prefix: '/payments' });
  await app.register(cha, { prefix: '/cha' });
  await app.register(notes, { prefix: '/notes' });
  await app.register(accessLinks, { prefix: '/access-links' });
  await app.register(reports, { prefix: '/reports' });
  await app.register(reminders, { prefix: '/reminders' });

  return app;
}
