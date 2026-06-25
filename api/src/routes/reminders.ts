import type { FastifyPluginAsync, FastifyReply } from 'fastify';

// Reminder webhook: forwards a shipment reminder to an n8n flow (which sends the
// email/WhatsApp). The webhook URL lives only in api/.env — never in the browser.
// Phase A wires the manual "send test" + the payload contract; the production
// daily-cron that fans these out lands with the Phase-B backend (see
// docs/n8n-reminders.md).

interface ReminderBody {
  fileNumber: string;
  kind: 'etd' | 'eta';
  date: string;
  daysLeft: number;
  suppliers?: string[];
  product?: string;
  to?: { email?: string };
}

const webhook = (): string => process.env.N8N_REMINDER_WEBHOOK ?? '';

export const reminders: FastifyPluginAsync = async (app) => {
  app.post('/test', async (req, reply: FastifyReply) => {
    const url = webhook();
    if (!url) {
      return reply
        .code(503)
        .send({ error: 'reminders_not_configured', message: 'Set N8N_REMINDER_WEBHOOK in api/.env to enable reminder emails.' });
    }
    const b = req.body as Partial<ReminderBody>;
    if (!b?.fileNumber || (b.kind !== 'etd' && b.kind !== 'eta')) {
      return reply.code(400).send({ error: 'bad_request', message: 'fileNumber + kind (etd|eta) required.' });
    }
    const payload = {
      event: 'shipment_reminder',
      fileNumber: b.fileNumber,
      kind: b.kind,
      date: b.date ?? '',
      daysLeft: typeof b.daysLeft === 'number' ? b.daysLeft : null,
      suppliers: Array.isArray(b.suppliers) ? b.suppliers : [],
      product: b.product ?? '',
      to: b.to ?? {},
      appUrl: process.env.APP_URL ?? '',
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        return reply.code(502).send({ error: 'webhook_failed', message: `n8n responded ${res.status}` });
      }
      return { ok: true, sent: payload };
    } catch (e) {
      return reply.code(502).send({ error: 'webhook_unreachable', message: (e as Error).message });
    }
  });
};
