// Shared-password gate. One password (APP_PASSWORD) protects the whole desk.
// Login exchanges it for a deterministic bearer token = HMAC(APP_PASSWORD, secret);
// the middleware recomputes the same token and timing-safe compares. Deterministic
// is fine for a single shared secret on an internal tool (no per-user identity).
//
// APP_PASSWORD unset => auth disabled (open). That's the "no login" mode and also
// how local dev runs without a password.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function authConfigured(): boolean {
  return !!process.env.APP_PASSWORD;
}

function expectedToken(): string {
  const pw = process.env.APP_PASSWORD ?? '';
  const secret = process.env.APP_SECRET || pw;
  return createHmac('sha256', secret).update(`import-desk:${pw}`).digest('hex');
}

/** Returns the bearer token if the password matches, else null. */
export function login(password: string): string | null {
  if (!authConfigured()) return '';
  const pw = process.env.APP_PASSWORD ?? '';
  if (typeof password !== 'string' || password.length !== pw.length) return null;
  const a = Buffer.from(password);
  const b = Buffer.from(pw);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return expectedToken();
}

export function tokenValid(token: string | undefined): boolean {
  if (!authConfigured()) return true;
  if (!token) return false;
  const exp = expectedToken();
  const a = Buffer.from(token);
  const b = Buffer.from(exp);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerFrom(header: string | undefined): string | undefined {
  if (!header) return undefined;
  return header.replace(/^Bearer\s+/i, '').trim() || undefined;
}
