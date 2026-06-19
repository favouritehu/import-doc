import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Logo } from '../components/Sidebar';
import { USERS } from '../data/seed';
import { ROLE_LABEL } from '../lib/rolePolicy';
import { useStore } from '../store/store';
import type { User } from '../types';

function GoogleG() {
  return (
    <span className="grid h-5 w-5 place-items-center rounded bg-white text-[12px] font-extrabold text-blue">
      G
    </span>
  );
}

export function Welcome() {
  const { signIn } = useStore();
  const nav = useNavigate();
  const enter = (u: User) => {
    signIn(u);
    nav('/', { replace: true });
  };
  const admin = USERS.find((u) => u.role === 'admin') ?? USERS[0];

  return (
    <div className="min-h-screen bg-navy px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 font-display text-2xl font-extrabold">Import Desk</h1>
          <p className="text-sm text-white/60">Favourite Fab · Import Control Tower</p>
          <p className="mt-3 max-w-xs text-sm text-white/70">
            Track every India import — documents, payments, customs — in one place. Know what's
            pending and who's responsible.
          </p>
        </div>

        <div className="rounded-xl2 bg-white p-5 text-ink shadow-modal">
          <button
            onClick={() => enter(admin)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy py-3 text-sm font-bold text-white transition hover:bg-blue"
          >
            <GoogleG /> Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <span className="h-px flex-1 bg-border" /> or pick a demo user <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            {USERS.map((u) => (
              <button
                key={u.id}
                onClick={() => enter(u)}
                className="flex items-center gap-3 rounded-card border border-border p-3 text-left transition hover:border-navy"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-sm font-bold text-white">
                  {u.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{u.name}</div>
                  <div className="text-xs text-muted">{ROLE_LABEL[u.role]}</div>
                </div>
                <ArrowRight size={16} className="text-faint" />
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/45">
          Phase A — demo sign-in, no real authentication. Google OAuth wires in Phase B.
        </p>
      </div>
    </div>
  );
}
