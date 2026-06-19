import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: FastifyError, req: FastifyRequest, reply: FastifyReply): void {
  req.log.error(error);
  const status = error.statusCode ?? 500;
  reply.code(status).send({ error: error.name ?? 'internal_error', message: error.message });
}
