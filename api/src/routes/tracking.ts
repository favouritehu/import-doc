// Container-tracking routes. /tracking/* is guarded by the shared-password hook;
// the Terminal49 webhook lives under /webhooks/* (open, since Terminal49 can't send
// our bearer token) and is protected by a secret path segment instead.

import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { DbNotConfigured } from '../db';
import {
  addTracking,
  trackByFile,
  getByFileId,
  listTracked,
  summary,
  stopTracking,
  refresh,
  activateNext,
  deleteRow,
  sweep,
  type TrackInput,
} from '../services/trackingRepo';

function guard(reply: FastifyReply, e: unknown): boolean {
  if (e instanceof DbNotConfigured) {
    reply.code(503).send({ error: 'db_not_configured', detail: 'Shared data (Postgres) must be enabled to track.' });
    return true;
  }
  return false;
}

export const tracking: FastifyPluginAsync = async (app) => {
  // Dashboard data: slot usage + every tracked row.
  app.get('/', async (_req, reply) => {
    try {
      return { summary: await summary(), rows: await listTracked() };
    } catch (e) {
      if (guard(reply, e)) return reply;
      throw e;
    }
  });

  // Add a shipment/container to track (BL > booking > container priority).
  app.post<{ Body: TrackInput }>('/', async (req, reply) => {
    try {
      const row = await addTracking(req.body ?? ({} as TrackInput));
      return { row };
    } catch (e) {
      if (guard(reply, e)) return reply;
      return reply.code(400).send({ error: 'bad_request', message: (e as Error).message });
    }
  });

  // Start (or fetch) tracking for an import file — deduped per file, BL-driven.
  app.post<{ Body: TrackInput & { importFileId: number } }>('/from-file', async (req, reply) => {
    try {
      if (typeof req.body?.importFileId !== 'number') {
        return reply.code(400).send({ error: 'bad_request', message: 'importFileId required' });
      }
      return { row: await trackByFile(req.body) };
    } catch (e) {
      if (guard(reply, e)) return reply;
      return reply.code(400).send({ error: 'bad_request', message: (e as Error).message });
    }
  });

  // The tracking status for one import file (null if not tracked).
  app.get<{ Params: { fileId: string } }>('/for-file/:fileId', async (req, reply) => {
    try {
      return { row: await getByFileId(Number(req.params.fileId)) };
    } catch (e) {
      if (guard(reply, e)) return reply;
      throw e;
    }
  });

  // Stop live tracking (admin) — snapshots, calls T49 stop, frees a slot, pulls next.
  app.post<{ Params: { id: string }; Body: { status?: 'stopped' | 'completed' } }>(
    '/:id/stop',
    async (req, reply) => {
      try {
        const row = await stopTracking(req.params.id, req.body?.status ?? 'stopped');
        return { row };
      } catch (e) {
        if (guard(reply, e)) return reply;
        return reply.code(400).send({ error: 'stop_failed', message: (e as Error).message });
      }
    },
  );

  // Pull the latest snapshot from Terminal49 for one row.
  app.post<{ Params: { id: string } }>('/:id/refresh', async (req, reply) => {
    try {
      return { row: await refresh(req.params.id) };
    } catch (e) {
      if (guard(reply, e)) return reply;
      return reply.code(400).send({ error: 'refresh_failed', message: (e as Error).message });
    }
  });

  // Manually fill any free slots from the queue (oldest first).
  app.post('/activate-next', async (_req, reply) => {
    try {
      const started = await activateNext();
      return { started, summary: await summary() };
    } catch (e) {
      if (guard(reply, e)) return reply;
      throw e;
    }
  });

  // Remove a row entirely (failed/stopped/completed clutter; active rows are
  // stopped on Terminal49 first). Frees + refills the slot.
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      await deleteRow(req.params.id);
      return { ok: true };
    } catch (e) {
      if (guard(reply, e)) return reply;
      throw e;
    }
  });

  // Manual sweep (the server also runs this on an interval).
  app.post('/sweep', async (_req, reply) => {
    try {
      return await sweep();
    } catch (e) {
      if (guard(reply, e)) return reply;
      throw e;
    }
  });
};

// Terminal49 webhook receiver. Open route, protected by a secret path segment
// (TERMINAL49_WEBHOOK_SECRET). Extracts the shipment/container id from the JSON:API
// payload and refreshes that local row.
export const trackingWebhook: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { secret: string }; Body: unknown }>('/terminal49/:secret', async (req, reply) => {
    const expected = process.env.TERMINAL49_WEBHOOK_SECRET || '';
    if (expected && req.params.secret !== expected) return reply.code(401).send({ error: 'bad_secret' });

    const ids = extractIds(req.body);
    // Import lazily so a webhook hit with no DB doesn't crash the process.
    const { applyWebhook } = await import('../services/trackingRepo');
    try {
      await applyWebhook(ids.shipmentId, ids.containerId);
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });
};

// Terminal49 sends JSON:API-ish webhook events; dig out any shipment/container id.
function extractIds(body: unknown): { shipmentId?: string; containerId?: string } {
  const out: { shipmentId?: string; containerId?: string } = {};
  const visit = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    const type = typeof o.type === 'string' ? o.type : undefined;
    const id = typeof o.id === 'string' ? o.id : undefined;
    if (id && type === 'shipment' && !out.shipmentId) out.shipmentId = id;
    if (id && type === 'container' && !out.containerId) out.containerId = id;
    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(body);
  return out;
}
