import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Cloud, CloudOff, LogOut, RotateCcw, Trash2, UploadCloud, Loader2 } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { FilterTabs } from '../components/FilterTabs';
import { Button } from '../components/Button';
import { Modal } from '../components/Overlay';
import { cx } from '../lib/cx';
import { ROLE_LABEL, RolePolicy } from '../lib/rolePolicy';
import { ITEMS, SUPPLIERS, TEMPLATES } from '../data/seed';
import { useStore } from '../store/store';
import type { Role } from '../types';

export function Settings() {
  const { role, user, users, files, serverMode, syncLocalToServer, showToast, signOut, clearAll, resetDemo, addUser, removeUser } =
    useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [confirm, setConfirm] = useState<'clear' | 'reset' | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pushing, setPushing] = useState(false);

  async function pushLocal() {
    if (pushing) return;
    setPushing(true);
    try {
      await syncLocalToServer();
    } catch {
      showToast('Could not reach the server — try again');
    } finally {
      setPushing(false);
    }
  }
  const tab = params.get('tab') ?? 'users';
  const canHsn = RolePolicy.canSeeHsn(role);
  const isAdmin = role === 'admin';

  const tabs = [
    { key: 'users', label: 'Users' },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'items', label: 'Items' },
    { key: 'templates', label: 'Templates' },
  ];

  return (
    <>
      <TopBar title="Settings" subtitle="Masters & access" />
      <Page>
        {user && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-border bg-white p-3 shadow-card">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-white">
                {user.initials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
                <div className="truncate text-xs text-muted">
                  {ROLE_LABEL[user.role]} · {user.email}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                signOut();
                nav('/welcome', { replace: true });
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-medium hover:border-red hover:text-red"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
        <div className="mb-4 flex items-center justify-between gap-3">
          <FilterTabs tabs={tabs} active={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
          <button
            onClick={() =>
              tab === 'users' && isAdmin
                ? setAddOpen(true)
                : showToast('Editing masters is wired in Phase B')
            }
            className="shrink-0 rounded-full bg-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue"
          >
            {tab === 'users' ? 'Add user' : 'Add'}
          </button>
        </div>

        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
          {tab === 'users' && (
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Email</th>
                  {isAdmin && <th className="px-3 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-semibold text-ink">
                      {u.name}
                      {user && u.id === user.id ? <span className="ml-1 text-[11px] font-normal text-muted">(you)</span> : ''}
                    </td>
                    <td className="px-3 py-2.5 text-medium">{ROLE_LABEL[u.role]}</td>
                    <td className="px-3 py-2.5 text-medium">{u.email}</td>
                    {isAdmin && (
                      <td className="px-3 py-2.5 text-right">
                        {user && u.id !== user.id && (
                          <button onClick={() => removeUser(u.id)} aria-label="Remove user" className="text-faint hover:text-red">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 'suppliers' && (
            <Table head={['Supplier', 'Country', 'Contact']}>
              {SUPPLIERS.map((s) => (
                <Row key={s.id} cells={[s.name, s.country, s.contact]} />
              ))}
            </Table>
          )}
          {tab === 'items' && (
            <Table head={canHsn ? ['Item', 'HSN', 'UOM'] : ['Item', 'UOM']}>
              {ITEMS.map((it) => (
                <Row key={it.id} cells={canHsn ? [it.name, it.hsn, it.uom] : [it.name, it.uom]} />
              ))}
            </Table>
          )}
          {tab === 'templates' && (
            <Table head={['Template', 'Mode', 'Incoterm']}>
              {TEMPLATES.map((t) => (
                <Row key={t.id} cells={[t.name, t.mode.toUpperCase(), t.incoterm]} />
              ))}
            </Table>
          )}
        </div>

        {isAdmin && (
          <div className="mt-5 rounded-card border border-border bg-white p-4 shadow-card">
            <div className="flex items-center gap-2 text-ink">
              {serverMode ? <Cloud size={16} className="text-green" /> : <CloudOff size={16} className="text-faint" />}
              <h3 className="font-display text-sm font-bold">Shared data</h3>
            </div>
            {serverMode ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  Connected to the shared server — everyone with the team password sees the same import
                  files. Reload to pull the latest edits from others.
                </p>
                <p className="mt-2 text-xs text-muted">
                  Got files that only exist in this browser? Send them up once:
                </p>
                <div className="mt-3">
                  <Button variant="ghost" onClick={pushLocal} disabled={pushing || files.length === 0}>
                    {pushing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                    {pushing ? 'Sending…' : `Send this browser's ${files.length} file${files.length === 1 ? '' : 's'} to the server`}
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Running on this browser only — the shared server has no database or is unreachable, so
                data is not shared yet. It syncs automatically once the server is connected.
              </p>
            )}
          </div>
        )}

        {isAdmin && !serverMode && (
          <div className="mt-5 rounded-card border border-red/30 bg-red/5 p-4">
            <div className="flex items-center gap-2 text-red">
              <AlertTriangle size={16} />
              <h3 className="font-display text-sm font-bold">Danger zone</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Data lives in this browser only. Clear it to start fresh, or restore the demo set.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => setConfirm('clear')}>
                <Trash2 size={14} /> Clear all data
              </Button>
              <Button variant="ghost" onClick={() => setConfirm('reset')}>
                <RotateCcw size={14} /> Reset to demo data
              </Button>
            </div>
          </div>
        )}
      </Page>

      {confirm && (
        <Modal
          title={confirm === 'clear' ? 'Clear all data?' : 'Reset to demo data?'}
          onClose={() => setConfirm(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm === 'clear' ? 'danger' : 'primary'}
                onClick={() => {
                  if (confirm === 'clear') {
                    clearAll();
                    nav('/welcome', { replace: true });
                  } else {
                    resetDemo();
                  }
                  setConfirm(null);
                }}
              >
                {confirm === 'clear' ? 'Clear everything' : 'Restore demo'}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-medium">
            {confirm === 'clear'
              ? 'Removes every import file, document and upload from this browser and signs you out. You start fresh with an empty workspace. Cannot be undone.'
              : 'Replaces current data with the 7 demo import files. Your current data will be lost.'}
          </p>
        </Modal>
      )}
      {addOpen && <AddUserModal onClose={() => setAddOpen(false)} onAdd={addUser} />}
    </>
  );
}

const ADD_ROLES: { key: Role; label: string }[] = [
  { key: 'admin', label: 'Owner' },
  { key: 'import_manager', label: 'Import Manager' },
  { key: 'accountant', label: 'Accountant' },
];

function AddUserModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (i: { name: string; email: string; role: Role }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('import_manager');
  const valid = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email);
  const inp = 'w-full rounded-card border border-border px-3 py-2.5 text-sm outline-none focus:border-navy';
  return (
    <Modal
      title="Add user"
      subtitle="Invite a teammate (Phase A: saved in this browser)"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onAdd({ name, email, role });
              onClose();
            }}
          >
            Add user
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="e.g. Anita Rao" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inp} placeholder="anita@favouritefab.in" />
        </label>
        <div>
          <span className="mb-1 block text-xs font-semibold text-muted">Role</span>
          <div className="flex flex-wrap gap-1 rounded-card bg-page p-1">
            {ADD_ROLES.map((r) => (
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
    </Modal>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full min-w-[420px] text-sm">
      <thead>
        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
          {head.map((h) => (
            <th key={h} className="px-3 py-2.5">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Row({ cells }: { cells: string[] }) {
  return (
    <tr className="border-b border-border last:border-0">
      {cells.map((c, i) => (
        <td key={i} className={cx('px-3 py-2.5', i === 0 ? 'font-semibold text-ink' : 'text-medium')}>
          {c}
        </td>
      ))}
    </tr>
  );
}
