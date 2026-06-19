import type { FastifyReply } from 'fastify';

/** Phase-A placeholder. Every CRUD route returns 501 until Phase B wires MySQL. */
export function notImplemented(reply: FastifyReply, what: string): FastifyReply {
  return reply.code(501).send({ error: 'not_implemented', phase: 'B', detail: what });
}
