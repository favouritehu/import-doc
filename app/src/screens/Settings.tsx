import { useNavigate, useSearchParams } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Page } from '../components/AppShell';
import { TopBar } from '../components/TopBar';
import { FilterTabs } from '../components/FilterTabs';
import { cx } from '../lib/cx';
import { ROLE_LABEL, RolePolicy } from '../lib/rolePolicy';
import { ITEMS, SUPPLIERS, TEMPLATES, USERS } from '../data/seed';
import { useStore } from '../store/store';

export function Settings() {
  const { role, user, showToast, signOut } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'users';
  const canHsn = RolePolicy.canSeeHsn(role);

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
            onClick={() => showToast('Editing masters is wired in Phase B')}
            className="hidden rounded-full bg-navy px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue sm:block"
          >
            Add
          </button>
        </div>

        <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
          {tab === 'users' && (
            <Table head={['Name', 'Role', 'Email']}>
              {USERS.map((u) => (
                <Row key={u.id} cells={[u.name, ROLE_LABEL[u.role], u.email]} />
              ))}
            </Table>
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
      </Page>
    </>
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
