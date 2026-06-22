import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Sidebar';
import { USERS } from '../data/seed';
import { useStore } from '../store/store';

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
  const admin = USERS.find((u) => u.role === 'admin') ?? USERS[0];

  const enter = () => {
    signIn(admin);
    nav('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-navy px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center">
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
            onClick={enter}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-navy py-3 text-sm font-bold text-white transition hover:bg-blue"
          >
            <GoogleG /> Continue with Google
          </button>
          <p className="mt-3 text-center text-[11px] text-muted">
            Signs you in as Owner. Switch roles anytime from the top bar.
          </p>
        </div>

        <p className="mt-5 text-center text-[11px] text-white/45">
          Phase A — demo sign-in, no real authentication. Google OAuth wires in Phase B.
        </p>
      </div>
    </div>
  );
}
