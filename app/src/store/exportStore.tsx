// Export Desk store: the live export file list + a toast. Own React context,
// nested inside StoreProvider so it shares the single app-wide role switcher
// (see main.tsx) without duplicating auth. Seeded + in-memory + IndexedDB
// persistence ONLY — no server sync (see docs/superpowers/specs/2026-07-11-
// export-desk-phase1-design.md §"Store decision"). Mirrors store.tsx's shape
// minus everything Phase-B (runSyncPlan / reconcileBaseline / server calls).
// Screens read deriveExportStatus(file) on render, so mutations here never
// store a derived status — files are raw data only.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type {
  Currency,
  Doc,
  DocStatus,
  ExportFile,
  ExportPayment,
  ExportPaymentType,
  PayDirection,
  Role,
} from '../types';
import { EXPORT_SEED_FILES } from '../data/exportSeed';
import { USERS } from '../data/seed';
import { APPROX_INR_RATE } from '../lib/format';
import { idbGet, idbSet } from '../lib/idb';
import { TODAY, useStore } from './store';

const FILES_IDB_KEY = 'export-desk-files';

const RECEIVABLE_TYPES = new Set<ExportPaymentType>(['advance_received', 'balance_received']);

const nextId = (fs: ExportFile[]): number => fs.reduce((m, f) => Math.max(m, f.id), 0) + 1;
const fileNo = (id: number): string => `EXP-25-${String(id).padStart(4, '0')}`;

function userName(role: Role): string {
  return USERS.find((u) => u.role === role)?.name ?? 'Owner';
}

function roleLabel(r: Role): string {
  return r === 'admin' ? 'Owner' : r === 'accountant' ? 'Accountant' : 'Export Manager';
}

function clock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── Action payloads ───────────────────────────────────────────────────

export interface ExportAddPaymentInput {
  type: ExportPaymentType;
  amount: number;
  currency: Currency;
  due: string;
}

export interface ExportDocTarget {
  invoiceId?: string;
  by?: string;
  reason?: string;
}

type Toast = { m: string; kind: 'info' | 'error' } | null;

interface ExportStore {
  role: Role;
  files: ExportFile[];
  toast: Toast;
  setToast: Dispatch<SetStateAction<Toast>>;
  getFile: (id: number) => ExportFile | undefined;
  getFileByNumber: (n: string) => ExportFile | undefined;
  /** Assigns id + fileNumber and adds a new file. Returns the new id. */
  addFile: (input: Omit<ExportFile, 'id' | 'fileNumber'>) => number;
  patchFile: (fileId: number, patch: Partial<ExportFile>) => void;
  deleteFile: (fileId: number) => void;
  addPayment: (fileId: number, p: ExportAddPaymentInput) => void;
  setDocStatus: (fileId: number, type: string, status: DocStatus, t?: ExportDocTarget) => void;
  addNote: (fileId: number, message: string) => void;
}

const ExportStoreCtx = createContext<ExportStore | null>(null);

export function ExportStoreProvider({
  children,
  initialFiles,
}: {
  children: ReactNode;
  /** Test-only seed (mirrors StoreProvider's initialFiles). */
  initialFiles?: ExportFile[];
}) {
  const { role, user } = useStore(); // shared "OAuth stand-in" role + signed-in user
  const [files, setFiles] = useState<ExportFile[]>(() => initialFiles ?? structuredClone(EXPORT_SEED_FILES));
  const [toast, setToast] = useState<Toast>(null);
  // Guards the persist effect: stays false until the IDB read completes (or is
  // skipped for test injection), so a slow/failed read can never overwrite a
  // returning user's saved files with the freshly-seeded initial state.
  const loaded = useRef(!!initialFiles);

  const showToast = useCallback((m: string, kind?: 'info' | 'error') => {
    const k = kind ?? (/could not|failed|error/i.test(m) ? 'error' : 'info');
    setToast({ m, kind: k });
    window.setTimeout(() => setToast((cur) => (cur?.m === m ? null : cur)), k === 'error' ? 4000 : 1900);
  }, []);

  // Hydrate once on mount: prefer whatever's already saved in IndexedDB over
  // the seed (a returning user's edits must win). No server, no baseline.
  useEffect(() => {
    if (initialFiles) return; // test-only injected seed — no I/O
    let alive = true;
    (async () => {
      const saved = await idbGet<ExportFile[]>(FILES_IDB_KEY).catch(() => undefined);
      if (!alive) return;
      if (saved) setFiles(saved);
      loaded.current = true;
    })();
    return () => {
      alive = false;
    };
  }, [initialFiles]);

  // Persist on every change, once hydration has settled.
  useEffect(() => {
    if (!loaded.current) return;
    idbSet(FILES_IDB_KEY, files).catch(() => showToast('Could not save — storage error'));
  }, [files, showToast]);

  const patchFile = useCallback((fileId: number, patch: Partial<ExportFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, ...patch } : f)));
  }, []);

  // Internal functional variant — patchFile's public shape (Partial merge) can't
  // express array appends (payments/notes) or per-doc/per-invoice targeting.
  const mutate = useCallback((fileId: number, fn: (f: ExportFile) => ExportFile) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? fn(f) : f)));
  }, []);

  const deleteFile = useCallback(
    (fileId: number) => {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      showToast('Export file deleted');
    },
    [showToast],
  );

  const addFile = useCallback(
    (input: Omit<ExportFile, 'id' | 'fileNumber'>): number => {
      const id = nextId(files);
      const file: ExportFile = { ...input, id, fileNumber: fileNo(id) };
      setFiles((prev) => [file, ...prev]);
      showToast('Export file created');
      return id;
    },
    [files, showToast],
  );

  const addPayment = useCallback(
    (fileId: number, p: ExportAddPaymentInput) => {
      const direction: PayDirection = RECEIVABLE_TYPES.has(p.type) ? 'receivable' : 'payable';
      const pay: ExportPayment =
        p.currency === 'INR'
          ? { type: p.type, direction, currency: 'INR', inr: p.amount, due: p.due, paid: null, status: 'pending', ref: '' }
          : {
              type: p.type,
              direction,
              currency: p.currency,
              usd: p.amount,
              rate: APPROX_INR_RATE[p.currency],
              due: p.due,
              paid: null,
              status: 'pending',
              ref: '',
            };
      mutate(fileId, (f) => ({ ...f, payments: [...f.payments, pay] }));
      showToast('Payment added');
    },
    [mutate, showToast],
  );

  // Sets a doc's status directly — a file-level doc, or (via t.invoiceId) an
  // invoice's CI/PL. Mirrors store.tsx's mutateDoc/setDoc collapsed into one call.
  const setDocStatus = useCallback(
    (fileId: number, type: string, status: DocStatus, t?: ExportDocTarget) => {
      const stamp = (d: Doc): Doc => ({
        ...d,
        status,
        by: status === 'missing' ? null : t?.by ?? user?.name ?? userName(role),
        at: status === 'missing' ? null : TODAY,
        reason: status === 'discrepant' ? t?.reason ?? d.reason ?? null : null,
      });
      mutate(fileId, (f) => {
        if (t?.invoiceId) {
          const inv = f.invoices.find((i) => i.id === t.invoiceId);
          if (inv && (inv.ci.type === type || inv.pl.type === type)) {
            return {
              ...f,
              invoices: f.invoices.map((i) => {
                if (i.id !== t.invoiceId) return i;
                if (i.ci.type === type) return { ...i, ci: stamp(i.ci) };
                return { ...i, pl: stamp(i.pl) };
              }),
            };
          }
          return {
            ...f,
            docs: f.docs.map((d) => (d.type === type && d.invoiceId === t.invoiceId ? stamp(d) : d)),
          };
        }
        return { ...f, docs: f.docs.map((d) => (d.type === type && !d.invoiceId ? stamp(d) : d)) };
      });
    },
    [mutate, role, user],
  );

  const addNote = useCallback(
    (fileId: number, message: string) => {
      mutate(fileId, (f) => ({
        ...f,
        notes: [
          { a: user?.name ?? userName(role), r: roleLabel(role), m: message, t: `${TODAY} ${clock()}` },
          ...f.notes,
        ],
      }));
    },
    [mutate, role, user],
  );

  const value = useMemo<ExportStore>(
    () => ({
      role,
      files,
      toast,
      setToast,
      getFile: (id) => files.find((f) => f.id === id),
      getFileByNumber: (n) => files.find((f) => f.fileNumber === n),
      addFile,
      patchFile,
      deleteFile,
      addPayment,
      setDocStatus,
      addNote,
    }),
    [role, files, toast, addFile, patchFile, deleteFile, addPayment, setDocStatus, addNote],
  );

  return <ExportStoreCtx.Provider value={value}>{children}</ExportStoreCtx.Provider>;
}

export function useExportStore(): ExportStore {
  const ctx = useContext(ExportStoreCtx);
  if (!ctx) throw new Error('useExportStore must be used within ExportStoreProvider');
  return ctx;
}
