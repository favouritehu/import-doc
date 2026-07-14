import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export type Desk = 'import' | 'export';
const KEY = 'import-desk-active-desk';

interface DeskCtx { desk: Desk; setDesk: (d: Desk) => void }
const Ctx = createContext<DeskCtx | null>(null);

function load(initial?: Desk): Desk {
  if (initial) return initial;
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'export' || v === 'import') return v;
  } catch { /* SSR / no storage */ }
  return 'import';
}

export function DeskProvider({ children, initialDesk }: { children: ReactNode; initialDesk?: Desk }) {
  const [desk, setDeskState] = useState<Desk>(() => load(initialDesk));
  const setDesk = (d: Desk) => {
    setDeskState(d);
    try { localStorage.setItem(KEY, d); } catch { /* ignore */ }
  };
  return <Ctx.Provider value={{ desk, setDesk }}>{children}</Ctx.Provider>;
}

export function useDesk(): DeskCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDesk must be used within DeskProvider');
  return c;
}

const IMPORT_PATHS = ['/', '/today', '/calendar', '/files', '/pending-docs', '/pending-payments', '/cha-desk', '/reports'];

/** Keeps `desk` in sync with the route: export routes force export, known import
 *  screens force import, shared screens (/settings) leave it unchanged. Mount once under Router. */
export function DeskRouteSync() {
  const { pathname } = useLocation();
  const { desk, setDesk } = useDesk();
  useEffect(() => {
    const isExport = pathname === '/exports' || pathname.startsWith('/exports/');
    const isImport = IMPORT_PATHS.includes(pathname) || pathname.startsWith('/files/');
    if (isExport && desk !== 'export') setDesk('export');
    else if (isImport && desk !== 'import') setDesk('import');
    // shared (e.g. /settings): leave desk unchanged
  }, [pathname, desk, setDesk]);
  return null;
}
