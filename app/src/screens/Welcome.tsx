import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Logo } from '../components/Sidebar';
import { cx } from '../lib/cx';
import { useStore } from '../store/store';
import type { Role, User } from '../types';

const ROLES: { key: Role; label: string }[] = [
  { key: 'admin', label: 'Owner' },
  { key: 'import_manager', label: 'Import Manager' },
  { key: 'accountant', label: 'Accountant' },
];

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

const inputCls =
  'w-full rounded-card border border-border px-3 py-2.5 text-sm text-ink outline-none focus:border-navy placeholder:text-faint';

export function Welcome() {
  const { signIn, users } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('admin');
  // Shared profiles exist -> default to "pick your name"; the form is opt-in.
  const [creating, setCreating] = useState(false);
  const showPicker = users.length > 0 && !creating;

  const pick = (u: User) => {
    signIn(u);
    nav('/', { replace: true });
  };

  const valid = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email);

  const submit = () => {
    if (!valid) return;
    const u: User = {
      // Unique per sign-in — a fixed id would overwrite the previous person's row
      // in the users list (the store syncs the signed-in user into it by id).
      id: Date.now(),
      name: name.trim(),
      role,
      initials: initialsOf(name),
      email: email.trim(),
    };
    signIn(u);
    nav('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-navy px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 font-display text-2xl font-extrabold">Import Desk</h1>
          <p className="text-sm text-white/60">Favourite Fab · Import Control Tower</p>
        </div>

        {showPicker ? (
          <div className="rounded-xl2 bg-white p-5 text-ink shadow-modal">
            <h2 className="font-display text-base font-bold text-ink">Who are you?</h2>
            <p className="mt-0.5 text-xs text-muted">Tap your profile — it follows you on every device.</p>
            <div className="mt-4 flex flex-col gap-2">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => pick(u)}
                  className="flex items-center gap-3 rounded-card border border-border p-3 text-left transition hover:border-navy"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">
                    {u.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{u.name}</span>
                    <span className="block text-xs text-muted">
                      {u.role === 'admin' ? 'Owner' : u.role === 'accountant' ? 'Accountant' : 'Import Manager'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setCreating(true)}
              className="mt-4 w-full rounded-full border border-border py-2.5 text-sm font-semibold text-medium transition hover:border-navy hover:text-navy"
            >
              + New profile
            </button>
          </div>
        ) : (
        <div className="rounded-xl2 bg-white p-5 text-ink shadow-modal">
          <h2 className="font-display text-base font-bold text-ink">Create your account</h2>
          <p className="mt-0.5 text-xs text-muted">Set up your profile to start tracking imports.</p>

          <div className="mt-4 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="e.g. Gaurav Garg"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Work email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className={inputCls}
                placeholder="you@favouritefab.in"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </label>
            <div>
              <span className="mb-1 block text-xs font-semibold text-muted">Your role</span>
              <div className="flex flex-wrap gap-1 rounded-card bg-page p-1">
                {ROLES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRole(r.key)}
                    className={cx(
                      'flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                      role === r.key ? 'bg-navy text-white' : 'text-muted hover:text-ink',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={!valid}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-navy py-3 text-sm font-bold text-white transition hover:bg-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            Get started <ArrowRight size={16} />
          </button>
          {users.length > 0 && (
            <button
              onClick={() => setCreating(false)}
              className="mt-3 w-full rounded-full border border-border py-2.5 text-sm font-semibold text-medium transition hover:border-navy hover:text-navy"
            >
              ← Pick an existing profile
            </button>
          )}
        </div>
        )}

        <p className="mt-5 text-center text-[11px] text-white/45">
          One team password protects the app; profiles are shared across devices.
        </p>
      </div>
    </div>
  );
}
