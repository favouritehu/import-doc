// Outer shared-password gate. Runs BEFORE StoreProvider so the bearer token exists
// before the store hydrates (which calls the guarded /files). When the server has
// no password (APP_PASSWORD unset) or is unreachable, the gate is a no-op and the
// app boots straight through (open / local mode).
//
// A stale token (password rotated) surfaces as a 401 in the store hydrate, which
// clears the token and reloads — landing back here with no token => login. No loop.

import { useEffect, useState, type ReactNode } from 'react';
import { authStatus, getToken } from '../lib/api';
import { Login } from '../screens/Login';

type Phase = 'checking' | 'login' | 'ready';

export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    let alive = true;
    authStatus()
      .then(({ required }) => {
        if (!alive) return;
        setPhase(!required || getToken() ? 'ready' : 'login');
      })
      .catch(() => alive && setPhase('ready')); // API down => boot in local mode
    return () => {
      alive = false;
    };
  }, []);

  if (phase === 'checking') return <div className="min-h-dvh bg-navy" />;
  if (phase === 'login') return <Login onAuthed={() => setPhase('ready')} />;
  return <>{children}</>;
}
