// Global app store: role (OAuth stand-in), the live file list, and a toast.
// All mutations are immutable updates; screens read deriveStatus() on render so
// the UI recomputes live. Doc actions take an optional invoiceId to target a
// per-invoice CI/PL instead of a file-level doc.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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
} from '../types';
import { SEED_FILES, USERS } from '../data/seed';
import { mkChecklist, mkInvoice, type InvoiceDraft } from '../lib/checklist';
import { APPROX_INR_RATE } from '../lib/format';
import { CHA_STEPS } from '../lib/docs';

export const TODAY = '18 Jun 2026';

const userName = (role: Role): string => USERS.find((u) => u.role === role)?.name ?? 'Owner';

let fileSeq = Math.max(...SEED_FILES.map((f) => f.id)) + 1;
const nextFileNumber = () => `IMP-25-${String(fileSeq).padStart(4, '0')}`;

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
  portLoading: string;
  portArrival: string;
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

interface Store {
  role: Role;
  files: ImportFile[];
  toast: string | null;
  setRole: (r: Role) => void;
  showToast: (m: string) => void;
  getFile: (id: number) => ImportFile | undefined;
  getFileByNumber: (n: string) => ImportFile | undefined;
  createFromTemplate: (input: CreateFromTemplateInput, tpl: TemplateLike) => number;
  createBlank: (input: BlankInput) => number;
  addInvoice: (fileId: number, draft: InvoiceDraft) => void;
  updateInvoice: (fileId: number, invId: string, patch: Partial<Invoice>) => void;
  removeInvoice: (fileId: number, invId: string) => void;
  uploadDoc: (fileId: number, type: string, t?: DocTarget) => void;
  approveDoc: (fileId: number, type: string, t?: DocTarget) => void;
  flagDoc: (fileId: number, type: string, reason: string, t?: DocTarget) => void;
  requestCorrection: (fileId: number, type: string, t?: DocTarget) => void;
  reuploadDoc: (fileId: number, type: string, t?: DocTarget) => void;
  clearDoc: (fileId: number, type: string, invoiceId?: string) => void;
  deleteFile: (fileId: number) => void;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('admin');
  const [files, setFiles] = useState<ImportFile[]>(SEED_FILES);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 1900);
  }, []);

  const patchFile = useCallback((fileId: number, fn: (f: ImportFile) => ImportFile) => {
    setFiles((prev) => prev.map((f) => (f.id === fileId ? fn(f) : f)));
  }, []);

  // Patch a single doc — invoice CI/PL when invoiceId set, else a file doc.
  const mutateDoc = useCallback(
    (fileId: number, type: string, invoiceId: string | undefined, mut: (d: Doc) => Doc) => {
      patchFile(fileId, (f) => {
        if (invoiceId) {
          return {
            ...f,
            invoices: f.invoices.map((inv) => {
              if (inv.id !== invoiceId) return inv;
              if (inv.ci.type === type) return { ...inv, ci: mut(inv.ci) };
              if (inv.pl.type === type) return { ...inv, pl: mut(inv.pl) };
              return inv;
            }),
          };
        }
        return { ...f, docs: f.docs.map((d) => (d.type === type ? mut(d) : d)) };
      });
    },
    [patchFile],
  );

  const setDoc = useCallback(
    (fileId: number, type: string, status: DocStatus, t: DocTarget | undefined, extra?: Partial<Doc>) => {
      mutateDoc(fileId, type, t?.invoiceId, (d) => ({
        ...d,
        status,
        by: status === 'missing' ? null : t?.by ?? userName(role),
        at: status === 'missing' ? null : TODAY,
        ...extra,
      }));
    },
    [mutateDoc, role],
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
        by: t?.by ?? userName(role),
        at: TODAY,
        version: (d.version ?? 1) + 1,
        fileName: t?.fileName ?? d.fileName ?? null,
        fileUrl: t?.fileUrl ?? d.fileUrl ?? null,
      }));
      showToast('Corrected document re-submitted');
    },
    [mutateDoc, role, showToast],
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
      const u = USERS.find((x) => x.role === role);
      patchFile(fileId, (f) => ({
        ...f,
        notes: [
          { a: u?.name ?? 'Owner', r: roleLabel(role), m: message, t: `${TODAY} ${clock()}` },
          ...f.notes,
        ],
      }));
    },
    [patchFile, role],
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

  const createFromTemplate = useCallback(
    (input: CreateFromTemplateInput, tpl: TemplateLike): number => {
      const id = fileSeq++;
      const file: ImportFile = {
        id,
        fileNumber: nextFileNumber(),
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
        manager: 'Rahul Mehta',
        accountant: 'Priya Shah',
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
      showToast('Import file created');
      return id;
    },
    [showToast],
  );

  const createBlank = useCallback(
    (input: BlankInput): number => {
      const id = fileSeq++;
      const file: ImportFile = {
        id,
        fileNumber: nextFileNumber(),
        country: input.country,
        mode: input.mode,
        incoterm: input.incoterm,
        isPartial: false,
        invoices: input.invoices.map((d) => mkInvoice(d)),
        blAwb: input.blAwb,
        portLoading: input.portLoading,
        portArrival: input.portArrival,
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
      showToast('Import file created');
      return id;
    },
    [showToast],
  );

  const value = useMemo<Store>(
    () => ({
      role,
      files,
      toast,
      setRole,
      showToast,
      getFile: (id) => files.find((f) => f.id === id),
      getFileByNumber: (n) => files.find((f) => f.fileNumber === n),
      createFromTemplate,
      createBlank,
      addInvoice,
      updateInvoice,
      removeInvoice,
      uploadDoc,
      approveDoc,
      flagDoc,
      requestCorrection,
      reuploadDoc,
      clearDoc,
      deleteFile,
      markPaid,
      addPayment,
      toggleChaStep,
      addNote,
      markClosed,
    }),
    [
      role,
      files,
      toast,
      showToast,
      createFromTemplate,
      createBlank,
      addInvoice,
      updateInvoice,
      removeInvoice,
      uploadDoc,
      approveDoc,
      flagDoc,
      requestCorrection,
      reuploadDoc,
      clearDoc,
      deleteFile,
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
