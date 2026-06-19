import type { FastifyReply, FastifyRequest } from 'fastify';

// Phase B: verify the Google-OAuth session JWT (internal routes) or the signed,
// revocable magic-link token (external /access-links/resolve routes), and attach
// the resolved role. Phase A is a no-op so the stubs stay reachable.
export async function requireAuth(_req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // no-op in Phase A
}

export type Role = 'admin' | 'import_manager' | 'accountant';

export function canSeeFinancials(role: Role): boolean {
  return role === 'admin' || role === 'accountant';
}
