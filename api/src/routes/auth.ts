// Shared-password login. GET /auth/status tells the app whether a password gate is
// on; POST /auth/login exchanges the password for a bearer token.

import type { FastifyPluginAsync } from 'fastify';
import { authConfigured, login } from '../services/auth';

export const auth: FastifyPluginAsync = async (app) => {
  app.get('/status', async () => ({ required: authConfigured() }));

  app.post<{ Body: { password?: string } }>('/login', async (req, reply) => {
    // Auth off => nothing to log in to; hand back an empty token so the client proceeds.
    if (!authConfigured()) return { token: '', required: false };
    const token = login(String(req.body?.password ?? ''));
    if (!token) return reply.code(401).send({ error: 'invalid_password' });
    return { token, required: true };
  });
};
