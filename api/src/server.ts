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

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? true });
  app.setErrorHandler(errorHandler);

  await app.register(health);
  await app.register(files, { prefix: '/files' });
  await app.register(documents, { prefix: '/documents' });
  await app.register(payments, { prefix: '/payments' });
  await app.register(cha, { prefix: '/cha' });
  await app.register(notes, { prefix: '/notes' });
  await app.register(accessLinks, { prefix: '/access-links' });
  await app.register(reports, { prefix: '/reports' });

  return app;
}
