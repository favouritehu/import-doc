import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { extract, discrepancy, translate, aiStatus, AiError, type InputFile } from '../services/ai';

function fail(reply: FastifyReply, e: unknown): FastifyReply {
  if (e instanceof AiError) {
    return reply
      .code(e.status)
      .send({ error: e.status === 503 ? 'ai_not_configured' : 'ai_error', message: e.message });
  }
  return reply.code(500).send({ error: 'internal', message: (e as Error).message });
}

export const ai: FastifyPluginAsync = async (app) => {
  app.get('/status', async () => aiStatus());

  // Upload PDFs/images (as base64) -> extracted {file, invoices[]}.
  app.post('/extract', async (req, reply) => {
    const body = req.body as { files?: InputFile[] };
    const files = (body?.files ?? []).filter((f) => f?.dataBase64 && f?.mimeType);
    if (!files.length) return reply.code(400).send({ error: 'no_files' });
    try {
      return await extract(files);
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Compare invoice fields against reference text -> mismatches.
  app.post('/discrepancy', async (req, reply) => {
    const b = req.body as { invoice?: Record<string, unknown>; refText?: string };
    try {
      return { mismatches: await discrepancy(b?.invoice ?? {}, b?.refText ?? '') };
    } catch (e) {
      return fail(reply, e);
    }
  });

  app.post('/translate', async (req, reply) => {
    const b = req.body as { text?: string; to?: 'en' | 'zh' };
    if (!b?.text) return reply.code(400).send({ error: 'no_text' });
    try {
      return { text: await translate(b.text, b.to === 'zh' ? 'zh' : 'en') };
    } catch (e) {
      return fail(reply, e);
    }
  });
};
