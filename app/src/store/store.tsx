// Global app store: role (OAuth stand-in), the live file list, and a toast.
// All mutations are immutable updates; screens read deriveStatus() on render so
// the UI recomputes live. Doc actions take an optional invoiceId to target a
// per-invoice CI/PL instead of a file-level doc.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Currency,
  Doc,
  DocStatus,
  ImportFile,
  Incoterm,
  Invoice,
  Mode,
  Payment,
  PaymentType,
  Priority,
  Role,
  User,
} from '../types';
import { SEED_FILES, USERS } from '../data/seed';
import { mkChecklist, mkInvoice, type InvoiceDraft } from '../lib/checklist';
import { APPROX_INR_RATE } from '../lib/format';
import { CHA_STEPS, docLabel } from '../lib/docs';
import { isRequired } from '../lib/derive';
import { idbGet, idbSet } from '../lib/idb';
import { diffFiles, reconcileBaseline } from '../lib/sync';
import {
  listFiles,
  runSyncPlan,
  importFiles,
  reserveId,
  uploadBlob,
  trackFromFile,
  flushPlanKeepalive,
  listUsersRemote,
  putUserRemote,
  deleteUserRemote,
  ApiError,
  clearToken,
} from '../lib/api';
import { scacFor } from '../lib/scac';

// When mode/incoterm change, keep uploads but fix each doc's required flag and
// swap bill_of_lading <-> awb for the new mode.
function remapDocs(docs: Doc[], mode: Mode, incoterm: Incoterm): Doc[] {
  return docs.map((d) => {
    let type = d.type;
    if (mode === 'air' && type === 'bill_of_lading') type = 'awb';
    else if (mode === 'sea' && type === 'awb') type = 'bill_of_lading';
    return { ...d, type, label: docLabel(type), required: isRequired(type, { mode, incoterm }) };
  });
}

// Real current date, formatted like parseDate expects ('18 Jun 2026'). Stamped on
// user actions (uploads, payments, notes) — was a hardcoded demo constant, which
// wrote a fixed wrong date into persistent/shared data.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const _now = new Date();
export const TODAY = `${_now.getDate()} ${MONTH_ABBR[_now.getMonth()]} ${_now.getFullYear()}`;

const userName = (role: Role): string => USERS.find((u) => u.role === role)?.name ?? 'Owner';

const USER_KEY = 'import-desk-user';
function loadUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && v.name ? (v as User) : null; // ignore legacy id-only values
  } catch {
    return null;
  }
}

const USERS_KEY = 'import-desk-users';
function loadUsers(): User[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as User[]) : [];
  } catch {
    return [];
  }
}

// Files (which may carry multi-MB uploaded documents) live in IndexedDB, not the
// ~5MB localStorage. Two keys so server mode never clobbers pre-existing local
// data: FILES_IDB_KEY is this browser's own store (Phase-A data, and the source
// for "import my local data"); SERVER_CACHE_KEY is the offline mirror of the
// shared server. Server mode writes ONLY the cache key, so the primary local copy
// survives the first (empty-server) load and stays importable.
const FILES_IDB_KEY = 'files';
const SERVER_CACHE_KEY = 'files-server-cache';

// Local-mode id / file number. In server mode ids are assigned by the server (a
// monotonic sequence) so parallel creators never collide on id=1.
const nextId = (fs: ImportFile[]): number => fs.reduce((m, f) => Math.max(m, f.id), 0) + 1;
const fileNo = (id: number): string => `IMP-25-${String(id).padStart(4, '0')}`;

// ── Action payloads ───────────────────────────────────────────────────

export interface CreateFromTemplateInput {
  templateId: string;
  invoiceNumber: string;
  usd: number;
  eta: string;
  etaDays: number;
}

export interface BlankInput {
  country: string;
  mode: Mode;
  incoterm: Incoterm;
  blAwb: string;
  containerNo?: string;
  portLoading: string;
  portArrival: string;
  etd?: string;
  eta: string;
  etaDays: number;
  shippingLine: string;
  forwarder: string;
  cha: string;
  manager: string;
  accountant: string;
  priority: Priority;
  invoices: InvoiceDraft[];
}

export interface DocTarget {
  invoiceId?: string;
  by?: string;
  fileName?: string;
  fileUrl?: string;
}

// User-driven "add a document" — known slot (file or invoice CI/PL) or a custom
// doc the user named themselves. Any file type.
export interface AddDocInput {
  type: string;
  label?: string;
  invoiceId?: string;
  fileName: string;
  fileUrl: string;
}

interface Store {
  role: Role;
  user: User | null;
  ready: boolean;
  /** true when files are backed by the shared server (Postgres); false = per-browser IndexedDB. */
  serverMode: boolean;
  files: ImportFile[];
  toast: { m: string; kind: 'info' | 'error' } | null;
  setRole: (r: Role) => void;
  signIn: (u: User) => void;
  signOut: () => void;
  showToast: (m: string, kind?: 'info' | 'error') => void;
  getFile: (id: number) => ImportFile | undefined;
  getFileByNumber: (n: string) => ImportFile | undefined;
  createFromTemplate: (input: CreateFromTemplateInput, tpl: TemplateLike) => Promise<number>;
  createBlank: (input: BlankInput) => Promise<number>;
  addInvoice: (fileId: number, draft: InvoiceDraft) => void;
  updateInvoice: (fileId: number, invId: string, patch: Partial<Invoice>) => void;
  removeInvoice: (fileId: number, invId: string) => void;
  uploadDoc: (fileId: number, type: string, t?: DocTarget) => void;
  addDocument: (fileId: number, d: AddDocInput) => void;
  approveDoc: (fileId: number, type: string, t?: DocTarget) => void;
  flagDoc: (fileId: number, type: string, reason: string, t?: DocTarget) => void;
  requestCorrection: (fileId: number, type: string, t?: DocTarget) => void;
  reuploadDoc: (fileId: number, type: string, t?: DocTarget) => void;
  clearDoc: (fileId: number, type: string, invoiceId?: string) => void;
  deleteFile: (fileId: number) => void;
  updateFile: (fileId: number, patch: Partial<ImportFile>) => void;
  clearAll: () => void;
  resetDemo: () => void;
  /** Push the current in-browser files onto the shared server (explicit, not automatic). */
  syncLocalToServer: () => Promise<number>;
  /** Persist an uploaded file: server storage in shared mode (returns a `srv:` ref),
   *  inline data URL locally or if storage is down. Returns {fileName, fileUrl}. */
  uploadFile: (f: File) => Promise<{ fileName: string; fileUrl: string }>;
  /** Download-ready JSON backup of all current files (for cross-device/site moves). */
  exportData: () => string;
  /** Add files from a backup as NEW entries (fresh ids — never overwrites existing). */
  importData: (incoming: ImportFile[]) => Promise<number>;
  users: User[];
  addUser: (input: { name: string; email: string; role: Role }) => void;
  removeUser: (id: number) => void;
  markPaid: (fileId: number, idx: number) => void;
  addPayment: (fileId: number, p: { type: PaymentType; amount: number; currency: Currency; due: string }) => void;
  toggleChaStep: (fileId: number, stepKey: string) => void;
  addNote: (fileId: number, message: string) => void;
  markClosed: (fileId: number) => void;
}

export interface TemplateLike {
  mode: Mode;
  incoterm: Incoterm;
  country: string;
  currency: Currency;
  supplier: string;
  cha: string;
  shippingLine: string;
  forwarder: string;
  product: string;
  hsn: string;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({
  children,
  initialFiles,
}: {
  children: ReactNode;
  /** Test-only seed. Production starts empty (no demo flash) and hydrates from IDB. */
  initialFiles?: ImportFile[];
}) {
  const [user, setUser] = useState<User | null>(() => loadUser());
  const role: Role = user?.role ?? 'admin';
  // Start empty — never flash demo files before IndexedDB hydrates. The real
  // files load in the hydrate effect below; demo is opt-in via Settings → reset.
  const [files, setFiles] = useState<ImportFile[]>(initialFiles ?? []);
  const [ready, setReady] = useState(!!initialFiles);
  const [serverMode, setServerMode] = useState(false);
  // Persist guard: stays false until hydration SUCCEEDS (from server OR IndexedDB).
  // The persist effect refuses to write while false, so a failed/slow load can
  // never overwrite stored files with the empty initial array (the data-loss bug).
  const loaded = useRef(false);
  // Sync baseline = last file state known to match the server. Diff against it to
  // find the minimal PUT/DELETE set; advance only for files that synced OK.
  const baseline = useRef<ImportFile[]>([]);
  // 'server' = shared Postgres; 'local' = per-browser IndexedDB (no DB / API down).
  const mode = useRef<'server' | 'local'>('local');
  // Which IDB key local-mode persists to. CRITICAL: when the offline fallback loads
  // the SERVER cache, edits must go back to the cache key — writing cache-derived
  // state into FILES_IDB_KEY would overwrite the browser's own (importable) data.
  const persistKey = useRef<string>(FILES_IDB_KEY);
  // Serialize server syncs + retry bookkeeping (see the persist effect).
  const syncBusy = useRef(false);
  const syncAgain = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const [users, setUsers] = useState<User[]>(() => loadUsers());
  const [toast, setToast] = useState<{ m: string; kind: 'info' | 'error' } | null>(null);

  const signIn = useCallback((u: User) => {
    setUser(u);
    try {
      window.localStorage.setItem(USER_KEY, JSON.stringify(u));
    } catch {
      /* ignore */
    }
    // Keep the shared profile list up to date (role switches included).
    if (mode.current === 'server') putUserRemote(u).catch(() => {});
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      window.localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // "View as" role switch — keeps the signed-in person, changes only their role.
  const setRole = useCallback(
    (r: Role) => {
      signIn(user ? { ...user, role: r } : USERS.find((x) => x.role === r) ?? USERS[0]);
    },
    [signIn, user],
  );

  const showToast = useCallback((m: string, kind?: 'info' | 'error') => {
    // Errors read differently and linger longer. Heuristic keeps existing call
    // sites working without threading a kind through every one.
    const k = kind ?? (/could not|failed|error|expired|wrong|unable|not available/i.test(m) ? 'error' : 'info');
    setToast({ m, kind: k });
    window.setTimeout(() => setToast((cur) => (cur?.m === m ? null : cur)), k === 'error' ? 4000 : 1900);
  }, []);

  // Hydrate on startup. Prefer the shared server; fall back to IndexedDB when the
  // server has no DB (503) or is unreachable. CRITICAL ordering (else the wipe-race
  // returns): set `baseline` and `files` FIRST, flip `loaded` LAST — the persist
  // effect is guarded on `loaded`, so it can't diff `[] -> serverFiles` and delete
  // rows before the real state is in place.
  useEffect(() => {
    let alive = true;
    try {
      window.localStorage.removeItem('import-desk-files'); // retire the old localStorage store
    } catch {
      /* ignore */
    }
    if (initialFiles) {
      // Test-only injected seed — no I/O.
      baseline.current = initialFiles;
      loaded.current = true;
      setReady(true);
      return;
    }
    (async () => {
      try {
        const server = await listFiles();
        if (!alive) return;
        try {
          sessionStorage.removeItem('id-401-reloaded');
        } catch {
          /* ignore */
        }
        setFiles(server);
        baseline.current = server;
        mode.current = 'server';
        setServerMode(true);
        // Mirror to the CACHE key only — never the primary local store, so an empty
        // server can't wipe this browser's Phase-A data before the user imports it.
        idbSet(SERVER_CACHE_KEY, server).catch(() => {});
        // Shared team profiles: merge the server list in (server wins by id) so a
        // new device offers "pick your name" instead of re-creating the profile.
        listUsersRemote()
          .then((remote) => {
            if (!alive || remote.length === 0) return;
            setUsers((prev) => {
              const byId = new Map(prev.map((u) => [u.id, u]));
              for (const u of remote) byId.set(u.id, u);
              return [...byId.values()];
            });
          })
          .catch(() => {});
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'unauthorized') {
          // Token stale/expired — drop it so the App-level gate shows the login.
          // Reload-once guard: if a reload already happened this session (e.g. the
          // server 401s /files while /auth/status false-negatives), fall through to
          // the offline fallback instead of reloading forever.
          clearToken();
          if (alive && !sessionStorage.getItem('id-401-reloaded')) {
            sessionStorage.setItem('id-401-reloaded', '1');
            window.location.reload();
            return;
          }
        } else {
          try {
            sessionStorage.removeItem('id-401-reloaded');
          } catch {
            /* ignore */
          }
        }
        // 503 (no DB) or network — offline. Prefer the server cache (last shared
        // state) if we have one, else this browser's own local store — and remember
        // WHICH key we loaded so edits persist back to the same key (never let
        // cache-derived state overwrite the browser's own importable data).
        const cache = await idbGet<ImportFile[]>(SERVER_CACHE_KEY).catch(() => undefined);
        const local = await idbGet<ImportFile[]>(FILES_IDB_KEY).catch(() => undefined);
        const saved = cache ?? local ?? [];
        if (!alive) return;
        persistKey.current = cache ? SERVER_CACHE_KEY : FILES_IDB_KEY;
        setFiles(saved);
        baseline.current = saved;
        mode.current = 'local';
        setServerMode(false);
      } finally {
        if (alive) {
          // CRITICAL: flip `loaded` LAST. setFiles/baseline above run in this same
          // async continuation (React 18 batches), so the persist effect never sees
          // an empty [] against a populated baseline. Do NOT insert an `await`
          // between the setFiles/baseline assignments and here — that reopens the
          // wipe-race.
          loaded.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialFiles]);

  // One serialized sync pass: diff CURRENT state vs baseline, run it, reconcile.
  // - Serialized (syncBusy): overlapping passes could land PUTs out of order and
  //   leave the server stale while the baseline records success.
  // - Re-diffs latest state via filesRef (not a stale snapshot) when re-entered.
  // - 401 => clearToken + reload once (password rotated mid-session).
  // - Other failures => baseline keeps the failed ids (reconcileBaseline) AND a
  //   retry timer re-runs the pass — a transient blip must not wait for the user's
  //   next edit to be retried.
  const filesRef = useRef<ImportFile[]>(files);
  filesRef.current = files;
  const runSync = useCallback(async () => {
    if (mode.current !== 'server') return;
    if (syncBusy.current) {
      syncAgain.current = true;
      return;
    }
    syncBusy.current = true;
    try {
      do {
        syncAgain.current = false;
        const snapshot = filesRef.current;
        const plan = diffFiles(baseline.current, snapshot);
        if (plan.upserts.length === 0 && plan.deletes.length === 0) continue;
        const failed = await runSyncPlan(plan);
        if (failed.unauthorized) {
          clearToken();
          if (!sessionStorage.getItem('id-401-reloaded')) {
            sessionStorage.setItem('id-401-reloaded', '1');
            window.location.reload();
          }
          return;
        }
        baseline.current = reconcileBaseline(baseline.current, snapshot, failed);
        if (failed.upserts.length || failed.deletes.length) {
          showToast('Some changes not saved to server — will retry');
          if (retryTimer.current === null) {
            retryTimer.current = window.setTimeout(() => {
              retryTimer.current = null;
              void runSync();
            }, 8000);
          }
        }
      } while (syncAgain.current);
    } finally {
      syncBusy.current = false;
    }
  }, [showToast]);

  // Persist on change. Write-through to IndexedDB in BOTH modes (offline cache +
  // fallback so a server outage next session shows the last good copy). In server
  // mode also debounce a serialized diff-sync. Guarded by loaded.current so a
  // failed hydrate can't wipe anything.
  useEffect(() => {
    if (!ready || !loaded.current) return;
    // Server mode caches to SERVER_CACHE_KEY; local mode writes back to whichever
    // key it hydrated from (persistKey) — never cache-derived state into the
    // browser's own importable FILES_IDB_KEY.
    const key = mode.current === 'server' ? SERVER_CACHE_KEY : persistKey.current;
    idbSet(key, files).catch(() => showToast('Could not save — storage error'));
    if (mode.current !== 'server') return;

    const t = window.setTimeout(() => void runSync(), 400);
    return () => window.clearTimeout(t);
  }, [files, ready, showToast, runSync]);

  // Tab close / navigate away within the debounce window: fire the pending diff as
  // keepalive requests so the last edit isn't silently dropped.
  useEffect(() => {
    const flush = () => {
      if (mode.current !== 'server') return;
      const plan = diffFiles(baseline.current, filesRef.current);
      if (plan.upserts.length || plan.deletes.length) flushPlanKeepalive(plan);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch {
      /* ignore */
    }
  }, [users]);

  // Seed the shared profile list: when the server connects, push every profile
  // this device already knows (idempotent upserts). Without this, profiles created
  // BEFORE profiles became shared never reach the server and new devices see an
  // empty picker.
  useEffect(() => {
    if (!serverMode) return;
    for (const u of users) putUserRemote(u).catch(() => {});
    // Intentionally only on connect — not on every users change (mutations sync themselves).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode]);

  // Keep the signed-in user present in the users list (and their role in sync).
  useEffect(() => {
    if (!user) return;
    setUsers((prev) =>
      prev.some((x) => x.id === user.id)
        ? prev.map((x) => (x.id === user.id ? user : x))
        : [...prev, user],
    );
  }, [user]);

  // Store-level guard (defense in depth behind the UI gate): in server mode these
  // would diff-sync as mass DELETEs / demo-file PUTs and destroy the whole TEAM's
  // shared data in Postgres. Local-only tools.
  const clearAll = useCallback(() => {
    if (mode.current === 'server') {
      showToast('Not available in shared mode');
      return;
    }
    setFiles([]);
    setUsers([]);
    signOut(); // full reset — also clears the signed-in user
    showToast('All data cleared');
  }, [signOut, showToast]);

  const resetDemo = useCallback(() => {
    if (mode.current === 'server') {
      showToast('Not available in shared mode');
      return;
    }
    setFiles(structuredClone(SEED_FILES));
    setUsers(structuredClone(USERS));
    showToast('Demo data restored');
  }, [showToast]);

  // Explicit one-shot: push what's in THIS browser's local store onto the shared
  // server. Never automatic (the first browser to load must not silently strand
  // everyone else's data). Reads the PRIMARY local copy (not the in-memory server
  // view), re-ids each file with a fresh server id so it can't clobber existing
  // rows, imports, then refreshes from the server so this browser now shows the
  // whole shared set (including teammates').
  // Upload a document. Shared mode stores bytes on the server volume and keeps only
  // a `srv:<key>` reference (so file bytes never bloat the DB rows); local mode — or
  // any server-storage failure — falls back to an inline data URL so uploads never
  // hard-break. Existing data: URLs keep working unchanged.
  const readAsDataUrl = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });
  const uploadFile = useCallback(
    async (f: File): Promise<{ fileName: string; fileUrl: string }> => {
      if (mode.current === 'server') {
        try {
          return { fileName: f.name, fileUrl: await uploadBlob(f) };
        } catch {
          /* storage down -> inline fallback below */
        }
      }
      return { fileName: f.name, fileUrl: await readAsDataUrl(f) };
    },
    [],
  );

  // Backup / restore. Export is a plain JSON dump of the CURRENT files (run it on
  // whichever browser holds the data you want). Import ADDS them as new files with
  // fresh ids — so moving old localhost data into the deployed app never overwrites
  // anything, and in server mode it lands straight in Postgres.
  const exportData = useCallback((): string => {
    return JSON.stringify({ app: 'import-desk', version: 1, exportedAt: TODAY, files }, null, 2);
  }, [files]);

  const importBusyRef = useRef(false);
  const importData = useCallback(
    async (incoming: ImportFile[]): Promise<number> => {
      if (!Array.isArray(incoming) || incoming.length === 0) {
        showToast('Nothing to import — file had no shipments');
        return 0;
      }
      if (importBusyRef.current) return 0;
      importBusyRef.current = true;
      try {
        if (mode.current === 'server') {
          const reided: ImportFile[] = [];
          for (const f of incoming) {
            const id = await reserveId();
            reided.push({ ...f, id, fileNumber: fileNo(id) });
          }
          // Chunk so a big backup (inline file data) can't exceed the API body limit.
          for (let i = 0; i < reided.length; i += 10) {
            await importFiles(reided.slice(i, i + 10));
          }
          let server: ImportFile[];
          try {
            server = await listFiles();
          } catch {
            server = [...reided, ...files];
          }
          setFiles(server);
          baseline.current = server;
          idbSet(SERVER_CACHE_KEY, server).catch(() => {});
        } else {
          // Local: append with fresh sequential ids (avoid colliding with existing).
          setFiles((prev) => {
            let max = prev.reduce((m, f) => Math.max(m, f.id), 0);
            const added = incoming.map((f) => {
              max += 1;
              return { ...f, id: max, fileNumber: fileNo(max) };
            });
            return [...added, ...prev];
          });
        }
        showToast(`Imported ${incoming.length} file${incoming.length === 1 ? '' : 's'}`);
        return incoming.length;
      } finally {
        importBusyRef.current = false;
      }
    },
    [files, showToast],
  );

  const importBusy = useRef(false);
  const syncLocalToServer = useCallback(async (): Promise<number> => {
    // Concurrency guard (belt over the UI's `pushing` state): two overlapping calls
    // would both read a non-empty local store and import everything twice.
    if (importBusy.current) return 0;
    importBusy.current = true;
    try {
      const local = (await idbGet<ImportFile[]>(FILES_IDB_KEY).catch(() => undefined)) ?? [];
      if (local.length === 0) {
        showToast('No files in this browser to send');
        return 0;
      }
      const reided: ImportFile[] = [];
      for (const f of local) {
        const id = await reserveId(); // throws if server unreachable -> caller toasts
        reided.push({ ...f, id, fileNumber: fileNo(id) });
      }
      await importFiles(reided);
      // Idempotency guard: the moment the import commits, empty the local store so a
      // double-click or a retry after a post-import network blip reads "nothing to
      // send" instead of importing the same files again under new ids (duplicates).
      await idbSet(FILES_IDB_KEY, []).catch(() => {});
      // The import COMMITTED — from here we must end in server mode even if the
      // refresh fails (else the persist effect would write the old files back into
      // the just-cleared local key and arm a duplicate re-import).
      let server: ImportFile[];
      try {
        server = await listFiles();
      } catch {
        server = reided; // best-effort view; reload pulls the full shared set
      }
      setFiles(server);
      baseline.current = server;
      mode.current = 'server';
      setServerMode(true);
      idbSet(SERVER_CACHE_KEY, server).catch(() => {});
      showToast(`Sent ${reided.length} file${reided.length === 1 ? '' : 's'} to the shared server`);
      return reided.length;
    } finally {
      importBusy.current = false;
    }
  }, [showToast]);

  const addUser = useCallback(
    (input: { name: string; email: string; role: Role }) => {
      const initials =
        input.name
          .trim()
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'U';
      // Time-based id: unique across devices (a counter would collide when two
      // devices add profiles independently).
      const u: User = { id: Date.now(), name: input.name.trim(), email: input.email.trim(), role: input.role, initials };
      setUsers((prev) => [...prev, u]);
      if (mode.current === 'server') putUserRemote(u).catch(() => {});
      showToast('User added');
    },
    [showToast],
  );

  const removeUser = useCallback(
    (id: number) => {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (mode.current === 'server') deleteUserRemote(id).catch(() => {});
      showToast('User removed');
    },
    [showToast],
  );

  const patchFile = useCallback((fileId: number, fn: (f: ImportFile) => ImportFile) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? fn(f) : f)));
  }, []);

  // Patch a single doc — invoice CI/PL when invoiceId set, else a file doc.
  const mutateDoc = useCallback(
    (fileId: number, type: string, invoiceId: string | undefined, mut: (d: Doc) => Doc) => {
      patchFile(fileId, (f) => {
        if (invoiceId) {
          // A CI/PL slot lives on the invoice; a custom per-party file lives in
          // file.docs tagged with invoiceId. Route to whichever this type is.
          const inv = f.invoices.find((i) => i.id === invoiceId);
          if (inv && (inv.ci.type === type || inv.pl.type === type)) {
            return {
              ...f,
              invoices: f.invoices.map((i) => {
                if (i.id !== invoiceId) return i;
                if (i.ci.type === type) return { ...i, ci: mut(i.ci) };
                return { ...i, pl: mut(i.pl) };
              }),
            };
          }
          return {
            ...f,
            docs: f.docs.map((d) => (d.type === type && d.invoiceId === invoiceId ? mut(d) : d)),
          };
        }
        return { ...f, docs: f.docs.map((d) => (d.type === type && !d.invoiceId ? mut(d) : d)) };
      });
    },
    [patchFile],
  );

  const setDoc = useCallback(
    (fileId: number, type: string, status: DocStatus, t: DocTarget | undefined, extra?: Partial<Doc>) => {
      mutateDoc(fileId, type, t?.invoiceId, (d) => ({
        ...d,
        status,
        by: status === 'missing' ? null : t?.by ?? user?.name ?? userName(role),
        at: status === 'missing' ? null : TODAY,
        ...extra,
      }));
    },
    [mutateDoc, role, user],
  );

  const uploadDoc = useCallback(
    (fileId: number, type: string, t?: DocTarget) => {
      setDoc(fileId, type, 'uploaded', t, {
        reason: null,
        fileName: t?.fileName ?? null,
        fileUrl: t?.fileUrl ?? null,
      });
      showToast(t?.fileName ? `Uploaded ${t.fileName}` : 'Document uploaded');
    },
    [setDoc, showToast],
  );

  // User picks a file + (optionally) names/types it. Fills a known slot when the
  // type already exists (file doc or invoice CI/PL); otherwise appends a fresh
  // custom doc. Lets users add only what they have — no full predefined checklist.
  const addDocument = useCallback(
    (fileId: number, d: AddDocInput) => {
      const by = user?.name ?? userName(role);
      const fill = (doc: Doc): Doc => ({
        ...doc,
        status: 'uploaded',
        by,
        at: TODAY,
        reason: null,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        label: d.label ?? doc.label,
      });
      const freshDoc = (invoiceId?: string): Doc => ({
        type: d.type,
        label: d.label ?? d.type,
        status: 'uploaded',
        required: false,
        by,
        at: TODAY,
        reason: null,
        version: 1,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        ...(invoiceId ? { invoiceId } : {}),
      });
      patchFile(fileId, (f) => {
        if (d.invoiceId) {
          const inv = f.invoices.find((i) => i.id === d.invoiceId);
          if (inv && (inv.ci.type === d.type || inv.pl.type === d.type)) {
            return {
              ...f,
              invoices: f.invoices.map((i) => {
                if (i.id !== d.invoiceId) return i;
                if (i.ci.type === d.type) return { ...i, ci: fill(i.ci) };
                return { ...i, pl: fill(i.pl) };
              }),
            };
          }
          if (f.docs.some((x) => x.type === d.type && x.invoiceId === d.invoiceId)) {
            return {
              ...f,
              docs: f.docs.map((x) => (x.type === d.type && x.invoiceId === d.invoiceId ? fill(x) : x)),
            };
          }
          return { ...f, docs: [...f.docs, freshDoc(d.invoiceId)] };
        }
        if (f.docs.some((x) => x.type === d.type && !x.invoiceId)) {
          return { ...f, docs: f.docs.map((x) => (x.type === d.type && !x.invoiceId ? fill(x) : x)) };
        }
        return { ...f, docs: [...f.docs, freshDoc()] };
      });
      showToast(`Added ${d.fileName}`);
    },
    [patchFile, role, user, showToast],
  );

  const approveDoc = useCallback(
    (fileId: number, type: string, t?: DocTarget) => {
      setDoc(fileId, type, 'approved', t, { reason: null });
      showToast('Document approved');
    },
    [setDoc, showToast],
  );

  const flagDoc = useCallback(
    (fileId: number, type: string, reason: string, t?: DocTarget) => {
      mutateDoc(fileId, type, t?.invoiceId, (d) => ({
        ...d,
        status: 'discrepant',
        reason,
        by: userName(role),
        at: TODAY,
      }));
      showToast('Discrepancy flagged');
    },
    [mutateDoc, role, showToast],
  );

  const requestCorrection = useCallback(
    (_fileId: number, _type: string, _t?: DocTarget) => {
      showToast('Correction requested from supplier');
    },
    [showToast],
  );

  const reuploadDoc = useCallback(
    (fileId: number, type: string, t?: DocTarget) => {
      mutateDoc(fileId, type, t?.invoiceId, (d) => ({
        ...d,
        status: 'under_review',
        reason: null,
        by: t?.by ?? user?.name ?? userName(role),
        at: TODAY,
        version: (d.version ?? 1) + 1,
        fileName: t?.fileName ?? d.fileName ?? null,
        fileUrl: t?.fileUrl ?? d.fileUrl ?? null,
      }));
      showToast('Corrected document re-submitted');
    },
    [mutateDoc, role, user, showToast],
  );

  const clearDoc = useCallback(
    (fileId: number, type: string, invoiceId?: string) => {
      mutateDoc(fileId, type, invoiceId, (d) => ({
        ...d,
        status: 'missing',
        by: null,
        at: null,
        reason: null,
        fileName: null,
        fileUrl: null,
      }));
      showToast('Document removed');
    },
    [mutateDoc, showToast],
  );

  const deleteFile = useCallback(
    (fileId: number) => {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      showToast('Import file deleted');
    },
    [showToast],
  );

  const updateFile = useCallback(
    (fileId: number, patch: Partial<ImportFile>) => {
      patchFile(fileId, (f) => {
        const next = { ...f, ...patch };
        if (patch.mode !== undefined || patch.incoterm !== undefined) {
          next.docs = remapDocs(next.docs, next.mode, next.incoterm);
        }
        return next;
      });
      showToast('Details updated');
    },
    [patchFile, showToast],
  );

  const markPaid = useCallback(
    (fileId: number, idx: number) => {
      patchFile(fileId, (f) => ({
        ...f,
        payments: f.payments.map((p, i) => (i === idx ? { ...p, status: 'paid', paid: TODAY } : p)),
      }));
      showToast('Payment marked paid');
    },
    [patchFile, showToast],
  );

  const addPayment = useCallback(
    (fileId: number, p: { type: PaymentType; amount: number; currency: Currency; due: string }) => {
      const pay: Payment =
        p.currency === 'INR'
          ? { type: p.type, currency: 'INR', inr: p.amount, due: p.due, paid: null, status: 'pending', ref: '' }
          : {
              type: p.type,
              currency: p.currency,
              usd: p.amount,
              rate: APPROX_INR_RATE[p.currency],
              due: p.due,
              paid: null,
              status: 'pending',
              ref: '',
            };
      patchFile(fileId, (f) => ({ ...f, payments: [...f.payments, pay] }));
      showToast('Payment added');
    },
    [patchFile, showToast],
  );

  const toggleChaStep = useCallback(
    (fileId: number, stepKey: string) => {
      patchFile(fileId, (f) => {
        const cur = f.chaOv[stepKey]?.[0] ?? 'pending';
        const next = cur === 'pending' ? 'done' : cur === 'done' ? 'na' : 'pending';
        return { ...f, chaOv: { ...f.chaOv, [stepKey]: [next, next === 'done' ? TODAY : ''] } };
      });
    },
    [patchFile],
  );

  const addNote = useCallback(
    (fileId: number, message: string) => {
      const u = user ?? USERS.find((x) => x.role === role);
      patchFile(fileId, (f) => ({
        ...f,
        notes: [
          { a: u?.name ?? 'Owner', r: roleLabel(role), m: message, t: `${TODAY} ${clock()}` },
          ...f.notes,
        ],
      }));
    },
    [patchFile, role, user],
  );

  const markClosed = useCallback(
    (fileId: number) => {
      patchFile(fileId, (f) => ({ ...f, status: 'closed', statusManual: true }));
      showToast('File marked closed');
    },
    [patchFile, showToast],
  );

  const addInvoice = useCallback(
    (fileId: number, draft: InvoiceDraft) => {
      patchFile(fileId, (f) => ({ ...f, invoices: [...f.invoices, mkInvoice(draft)] }));
      showToast('Invoice added');
    },
    [patchFile, showToast],
  );

  const updateInvoice = useCallback(
    (fileId: number, invId: string, patch: Partial<Invoice>) => {
      patchFile(fileId, (f) => ({
        ...f,
        invoices: f.invoices.map((inv) => (inv.id === invId ? { ...inv, ...patch } : inv)),
      }));
    },
    [patchFile],
  );

  const removeInvoice = useCallback(
    (fileId: number, invId: string) => {
      patchFile(fileId, (f) =>
        f.invoices.length <= 1 ? f : { ...f, invoices: f.invoices.filter((inv) => inv.id !== invId) },
      );
    },
    [patchFile],
  );

  // Server-assigned id in server mode (collision-free); local max+1 otherwise. If a
  // server-mode reserve fails transiently, fall back to a random high id so we still
  // never collide on id=1 (the subsequent PUT will retry via the sync loop).
  const allocId = useCallback(async (): Promise<number> => {
    if (mode.current === 'server') {
      try {
        return await reserveId();
      } catch {
        return 900_000_000 + Math.floor(Math.random() * 99_999_999);
      }
    }
    return nextId(files);
  }, [files]);

  // Auto-start Terminal49 tracking when a new file has a BL and a resolvable
  // carrier (from the shipping-line name). Best-effort, respects the 10-slot queue.
  const autoTrack = (f: ImportFile) => {
    if (mode.current !== 'server') return;
    const scac = scacFor(f.shippingLine);
    if (!scac) return;
    const container = f.containerNo?.trim();
    // Prefer the container number (most precise); fall back to the BL.
    if (container) trackFromFile({ importFileId: f.id, containerNumber: container, scac }).catch(() => {});
    else if (f.blAwb) trackFromFile({ importFileId: f.id, blNumber: f.blAwb, scac }).catch(() => {});
  };

  const createFromTemplate = useCallback(
    async (input: CreateFromTemplateInput, tpl: TemplateLike): Promise<number> => {
      const id = await allocId();
      const file: ImportFile = {
        id,
        fileNumber: fileNo(id),
        country: tpl.country,
        mode: tpl.mode,
        incoterm: tpl.incoterm,
        isPartial: false,
        invoices: [
          mkInvoice({
            supplier: tpl.supplier,
            invoiceNumber: input.invoiceNumber,
            usd: input.usd,
            currency: tpl.currency,
            invoiceDate: TODAY,
            product: tpl.product,
            hsn: tpl.hsn,
          }),
        ],
        blAwb: '',
        portLoading: '',
        portArrival: '',
        eta: input.eta,
        etaDays: input.etaDays,
        arrivedOn: null,
        shippingLine: tpl.shippingLine,
        forwarder: tpl.forwarder,
        boeNumber: null,
        boeDate: null,
        manager: user?.name ?? 'Unassigned',
        accountant: user?.name ?? 'Unassigned',
        cha: tpl.cha,
        status: 'draft',
        priority: 'normal',
        docs: mkChecklist(tpl.mode, tpl.incoterm),
        payments: [],
        duty: { bcd: 0, sws: 0, igst: 0, cess: 0, anti_dumping: 0, other: 0 },
        chaOv: emptyCha(),
        notes: [],
      };
      setFiles((prev) => [file, ...prev]);
      autoTrack(file);
      showToast('Import file created');
      return id;
    },
    [allocId, user, showToast],
  );

  const createBlank = useCallback(
    async (input: BlankInput): Promise<number> => {
      const id = await allocId();
      const file: ImportFile = {
        id,
        fileNumber: fileNo(id),
        country: input.country,
        mode: input.mode,
        incoterm: input.incoterm,
        isPartial: false,
        invoices: input.invoices.map((d) => mkInvoice(d)),
        blAwb: input.blAwb,
        containerNo: input.containerNo?.trim() || undefined,
        portLoading: input.portLoading,
        portArrival: input.portArrival,
        etd: input.etd?.trim() || undefined,
        eta: input.eta,
        etaDays: input.etaDays,
        arrivedOn: null,
        shippingLine: input.shippingLine,
        forwarder: input.forwarder,
        boeNumber: null,
        boeDate: null,
        manager: input.manager,
        accountant: input.accountant,
        cha: input.cha,
        status: 'draft',
        priority: input.priority,
        docs: mkChecklist(input.mode, input.incoterm),
        payments: [],
        duty: { bcd: 0, sws: 0, igst: 0, cess: 0, anti_dumping: 0, other: 0 },
        chaOv: emptyCha(),
        notes: [],
      };
      setFiles((prev) => [file, ...prev]);
      autoTrack(file);
      showToast('Import file created');
      return id;
    },
    [allocId, user, showToast],
  );

  const value = useMemo<Store>(
    () => ({
      role,
      user,
      ready,
      serverMode,
      files,
      toast,
      setRole,
      signIn,
      signOut,
      showToast,
      getFile: (id) => files.find((f) => f.id === id),
      getFileByNumber: (n) => files.find((f) => f.fileNumber === n),
      createFromTemplate,
      createBlank,
      addInvoice,
      updateInvoice,
      removeInvoice,
      uploadDoc,
      addDocument,
      approveDoc,
      flagDoc,
      requestCorrection,
      reuploadDoc,
      clearDoc,
      deleteFile,
      updateFile,
      clearAll,
      resetDemo,
      syncLocalToServer,
      uploadFile,
      exportData,
      importData,
      users,
      addUser,
      removeUser,
      markPaid,
      addPayment,
      toggleChaStep,
      addNote,
      markClosed,
    }),
    [
      role,
      user,
      ready,
      serverMode,
      files,
      toast,
      signIn,
      signOut,
      showToast,
      createFromTemplate,
      createBlank,
      addInvoice,
      updateInvoice,
      removeInvoice,
      uploadDoc,
      addDocument,
      approveDoc,
      flagDoc,
      requestCorrection,
      reuploadDoc,
      clearDoc,
      deleteFile,
      updateFile,
      clearAll,
      resetDemo,
      syncLocalToServer,
      uploadFile,
      exportData,
      importData,
      users,
      addUser,
      removeUser,
      markPaid,
      addPayment,
      toggleChaStep,
      addNote,
      markClosed,
    ],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// ── helpers ───────────────────────────────────────────────────────────

function emptyCha() {
  const ov: ImportFile['chaOv'] = {};
  for (const s of CHA_STEPS) ov[s.key] = ['pending', ''];
  return ov;
}

function roleLabel(r: Role): string {
  return r === 'admin' ? 'Owner' : r === 'accountant' ? 'Accountant' : 'Import Manager';
}

function clock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
