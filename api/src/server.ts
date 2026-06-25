import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { errorHandler } from './middleware/errorHandler';
import { health } from './routes/health';
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

  await app.register(health);
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
