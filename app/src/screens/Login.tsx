// Shared-password gate screen. One password protects the whole deployment; once
// past it the normal Welcome/role flow continues. Shown by AuthGate only when the
// server reports a password is required and this browser has no valid token.

import { useState, type FormEvent } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { login, setToken, ApiError } from '../lib/api';

export function Login({ onAuthed }: { onAuthed: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const token = await login(pw);
      setToken(token);
      onAuthed();
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.kind === 'unauthorized') setErr('Wrong password. Try again.');
      else if (e instanceof ApiError && e.kind === 'network') setErr('Cannot reach the server.');
      else setErr('Something went wrong. Try again.');
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-navy px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_24px_60px_rgba(0,0,0,.3)]"
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-sm font-black text-white">
            ID
          </span>
          <div>
            <div className="font-display text-base font-bold text-ink">Import Desk</div>
            <div className="text-xs text-muted">Favourite Fab</div>
          </div>
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-muted">Team password</label>
        <div className="relative">
          <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            placeholder="Enter the shared password"
            className="w-full rounded-card border border-border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-navy"
          />
        </div>

        {err && <p className="mt-2 text-xs font-semibold text-red">{err}</p>}

        <button
          type="submit"
          disabled={!pw || busy}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-card bg-navy py-2.5 text-sm font-semibold text-white hover:bg-blue disabled:opacity-50"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          {busy ? 'Checking…' : 'Continue'}
        </button>

        <p className="mt-3 text-center text-[11px] text-faint">
          Shared across your team. Ask the owner for the password.
        </p>
      </form>
    </div>
  );
}
