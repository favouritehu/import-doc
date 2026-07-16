# AI Payment-Amount Scan (import + export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Add Payment on both desks, let AI read a source document and prefill the amount + currency (never lock — always editable).

**Architecture:** Client OCR (`app/src/lib/ocr.ts::extractText`) → new `POST /ai/extract-payment` → DeepSeek text extraction. A new backend `extractPayment(kind, text)` lives *inside* `api/src/services/ai.ts` (its helpers are module-private). A pure `interpretScan()` helper carries the testable UI-decision logic; both payment modals route their scan result through it.

**Tech Stack:** React 18 + TS strict, Vite, Tailwind 3.4, vitest, Fastify (api), DeepSeek text provider.

## Global Constraints

- Engine = client OCR → DeepSeek text. **NEVER Gemini vision** (`GEMINI_API_KEY` dead in prod).
- Additive/surgical only. **No change** to derive engines, status derivation, or §0 role gating. Scan buttons live inside the payments modal, already behind `canFin` — implicitly role-gated.
- **DEFER `ref` threading.** v2 prefills amount + currency only; scanned ref is dropped (stores unchanged). Do NOT touch `store.addPayment` / `exportStore.addPayment` signatures.
- Export desk has **no** doc-upload UI — the export scan must NOT try to persist a doc; scan the picked/existing `File` directly.
- Frontend `AiError` (`recoverable: boolean`) ≠ backend `AiError` (`status: number`). Client catches the frontend one.
- Baseline: **129 tests green**, main `83bdf80`. Keep ≥129 green; add ≥3.
- Verify each task: `cd app && npx tsc --noEmit` + `npx vitest run` clean; backend touch also `cd api && npx tsc --noEmit`.
- Commit footers (every commit):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FH3Xazx5MWnTeCPv6ErqKu
  ```

---

### Task 1: Pure `interpretScan` helper (frontend, TDD)

**Files:**
- Create: `app/src/lib/scanPayment.ts`
- Test: `app/src/test/scanPayment.test.ts`

**Interfaces:**
- Consumes: `PaymentExtract` type from `./ai` (added in Task 2 — but the shape is `{ amount: number; currency: string; ref: string }`; declare the test's mock objects inline so Task 1 does not block on Task 2).
- Produces: `interpretScan(r: PaymentExtract, docLabel: string): ScanOutcome` where `ScanOutcome = { amount?: string; currency?: string; note: string }`. Consumed by Tasks 3 & 4.

- [ ] **Step 1: Write the failing test**

```ts
// app/src/test/scanPayment.test.ts
import { describe, it, expect } from 'vitest';
import { interpretScan } from '../lib/scanPayment';

describe('interpretScan', () => {
  it('amount > 0 → returns amount + currency + verify note', () => {
    const out = interpretScan({ amount: 51234.5, currency: 'INR', ref: 'BE123' }, 'Bill of Entry');
    expect(out.amount).toBe('51234.5');
    expect(out.currency).toBe('INR');
    expect(out.note).toBe('Read from Bill of Entry — verify before saving.');
  });

  it('amount === 0 → note-only "enter manually", no amount/currency', () => {
    const out = interpretScan({ amount: 0, currency: 'INR', ref: '' }, 'Bill of Entry');
    expect(out.amount).toBeUndefined();
    expect(out.currency).toBeUndefined();
    expect(out.note).toBe("Couldn't read an amount — enter it manually.");
  });

  it('negative amount → note-only "enter manually"', () => {
    const out = interpretScan({ amount: -5, currency: 'USD', ref: '' }, 'FIRC/BRC');
    expect(out.amount).toBeUndefined();
    expect(out.note).toBe("Couldn't read an amount — enter it manually.");
  });

  it('null-ish result → note-only "enter manually"', () => {
    const out = interpretScan(null as any, 'Freight Invoice');
    expect(out.amount).toBeUndefined();
    expect(out.note).toBe("Couldn't read an amount — enter it manually.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/test/scanPayment.test.ts`
Expected: FAIL — cannot resolve `../lib/scanPayment`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/src/lib/scanPayment.ts
import type { PaymentExtract } from './ai';

export interface ScanOutcome {
  amount?: string;
  currency?: string;
  note: string;
}

/** Pure decision for what a scan result should do to the Add-Payment form.
 *  amount>0 → prefill amount+currency + "verify" note; else note-only. */
export function interpretScan(r: PaymentExtract, docLabel: string): ScanOutcome {
  if (!r || r.amount <= 0) {
    return { note: "Couldn't read an amount — enter it manually." };
  }
  return {
    amount: String(r.amount),
    currency: r.currency,
    note: `Read from ${docLabel} — verify before saving.`,
  };
}
```

Note: `PaymentExtract` is added to `app/src/lib/ai.ts` in Task 2. If Task 1 runs first and `tsc` complains about the missing export, add a local `interface PaymentExtract { amount: number; currency: string; ref: string }` to `ai.ts` as part of Task 1 (Task 2's re-declaration then reuses it). Simplest: do Task 1 and Task 2 in order; the `import type` resolves once Task 2 lands. To keep Task 1 self-testing, temporarily declare the type in `scanPayment.ts` and switch to `import type` in Task 2 — OR just run Tasks 1→2 back to back. **Chosen: declare the type in `ai.ts` now** (one line, harmless) so the `import type` resolves immediately:

Add to `app/src/lib/ai.ts` right after the `AiError` class (≈ line 17):
```ts
export interface PaymentExtract { amount: number; currency: string; ref: string }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/test/scanPayment.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + full suite**

Run: `cd app && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; ≥133 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/scanPayment.ts app/src/test/scanPayment.test.ts app/src/lib/ai.ts
git commit -m "feat(ai-scan): pure interpretScan helper + PaymentExtract type"
```

---

### Task 2: Backend `extractPayment` + route + client `aiExtractPayment`

**Files:**
- Modify: `api/src/services/ai.ts` (add `extractPayment` + `PaymentExtract` + `PAYMENT_PROMPTS` after `translate`, before the "Paste-to-update" section ≈ line 359)
- Modify: `api/src/routes/ai.ts` (import `extractPayment`; add `POST /extract-payment` after `/translate` ≈ line 117)
- Modify: `app/src/lib/ai.ts` (add `aiExtractPayment`; `PaymentExtract` already added in Task 1)

**Interfaces:**
- Consumes: module-private `textConfigured`, `AiError`, `textProvider`, `deepseekJson`, `geminiJson`, `coerceAmount`, `coerceCurrency`, `str` (all already in `ai.ts`).
- Produces: `aiExtractPayment(kind: 'duty' | 'freight' | 'firc', text: string): Promise<PaymentExtract>` in `app/src/lib/ai.ts`. Consumed by Tasks 3 & 4.

- [ ] **Step 1: Add `extractPayment` to `api/src/services/ai.ts`**

Insert after the `translate` function (≈ line 330, before the `// ── Supplier chase` block or before `// ── Paste-to-update`):

```ts
// ── Payment amount scan (duty / freight / firc) ───────────────────────

export interface PaymentExtract { amount: number; currency: string; ref: string }

const PAYMENT_PROMPTS: Record<'duty' | 'freight' | 'firc', string> = {
  duty: `You read an Indian customs Bill of Entry. Extract the TOTAL DUTY PAYABLE (BCD + IGST + Social Welfare Surcharge + any other customs duty/cess — the final total duty, NOT the assessable/CIF value). OUTPUT JSON ONLY: {"amount":0,"currency":"INR","ref":""}. Duty is always INR. ref = Bill of Entry number. Do not invent values; use 0/"" if genuinely absent.`,
  freight: `You read a freight invoice for a shipment. Extract the TOTAL FREIGHT AMOUNT CHARGED and its currency. OUTPUT JSON ONLY: {"amount":0,"currency":"USD|EUR|CNY|INR","ref":""}. ref = freight invoice number. Do not invent values; use 0/"" if genuinely absent.`,
  firc: `You read a bank FIRC/BRC (Foreign Inward Remittance / Bank Realization Certificate) for an export. Extract the REMITTANCE AMOUNT RECEIVED and its currency. OUTPUT JSON ONLY: {"amount":0,"currency":"USD|EUR|CNY|INR","ref":""}. ref = FIRC/BRC reference number. Do not invent values; use 0/"" if absent.`,
};

export async function extractPayment(
  kind: 'duty' | 'freight' | 'firc',
  text: string,
): Promise<PaymentExtract> {
  if (!textConfigured()) throw new AiError('ai_not_configured: set DEEPSEEK_API_KEY', 503);
  const user = `DOCUMENT TEXT (OCR — may have noise):\n${text.slice(0, 6000)}`;
  const dflt = kind === 'duty' ? 'INR' : 'USD';
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(PAYMENT_PROMPTS[kind], user)
      : await geminiJson([{ text: `${PAYMENT_PROMPTS[kind]}\n\n${user}` }]);
  const r = raw as any;
  return {
    amount: coerceAmount(r?.amount),
    currency: coerceCurrency(r?.currency ?? dflt),
    ref: str(r?.ref),
  };
}
```

- [ ] **Step 2: Add the route to `api/src/routes/ai.ts`**

Add `extractPayment` to the import block (line 2-15) and add the route after `/translate` (≈ line 117, inside the plugin, before the closing `};`):

```ts
  // Scan a source doc's OCR text -> {amount, currency, ref} for a payment.
  app.post('/extract-payment', async (req, reply) => {
    const b = req.body as { kind?: string; text?: string };
    if (b?.kind !== 'duty' && b?.kind !== 'freight' && b?.kind !== 'firc')
      return reply.code(400).send({ error: 'bad_kind' });
    if (!b?.text?.trim()) return reply.code(400).send({ error: 'no_text' });
    try {
      return await extractPayment(b.kind, b.text);
    } catch (e) {
      return fail(reply, e);
    }
  });
```

- [ ] **Step 3: Add `aiExtractPayment` to `app/src/lib/ai.ts`**

Add after `aiUpdate` (≈ line 166):

```ts
/** Scan a source document's OCR text into {amount, currency, ref} for a payment. */
export async function aiExtractPayment(
  kind: 'duty' | 'freight' | 'firc',
  text: string,
): Promise<PaymentExtract> {
  return post<PaymentExtract>('/ai/extract-payment', { kind, text });
}
```

- [ ] **Step 4: Typecheck both packages**

Run: `cd api && npx tsc --noEmit` → Expected: clean.
Run: `cd app && npx tsc --noEmit && npx vitest run` → Expected: clean; ≥133 tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/src/services/ai.ts api/src/routes/ai.ts app/src/lib/ai.ts
git commit -m "feat(ai-scan): backend extractPayment + /ai/extract-payment route + client"
```

---

### Task 3: Import UI — scan button in `AddPaymentModal`

**Files:**
- Modify: `app/src/screens/FileDetail.tsx` (call site ≈ line 384; `AddPaymentModal` ≈ line 600-672)

**Interfaces:**
- Consumes: `interpretScan` (Task 1), `aiExtractPayment` (Task 2), `extractText` from `../lib/ocr`, `CURRENCY_SAFE` from `../lib/ai`, `AiError` from `../lib/ai`, `store.toast`.
- Produces: none downstream.

- [ ] **Step 1: Pass `file` to the modal**

At ≈ line 384, change:
```tsx
{addPay && <AddPaymentModal onClose={() => setAddPay(false)} onAdd={(p) => store.addPayment(file.id, p)} />}
```
to:
```tsx
{addPay && <AddPaymentModal file={file} onClose={() => setAddPay(false)} onAdd={(p) => store.addPayment(file.id, p)} />}
```

- [ ] **Step 2: Confirm imports present in `FileDetail.tsx`**

Ensure these imports exist (add any missing): `extractText` from `../lib/ocr`; `aiExtractPayment`, `CURRENCY_SAFE`, `AiError` from `../lib/ai`; `interpretScan` from `../lib/scanPayment`; `ImportFile` type from `../types`. `useStore()`/`store` is already in the parent — the modal takes `file` as a prop and needs its own `store` for the toast; import `useStore` if not already imported and call it inside the modal (pattern used elsewhere in this file).

- [ ] **Step 3: Rewrite `AddPaymentModal` signature + body**

Replace the modal (≈ line 600-672) with:

```tsx
function AddPaymentModal({
  file,
  onClose,
  onAdd,
}: {
  file: ImportFile;
  onClose: () => void;
  onAdd: (p: { type: PaymentType; amount: number; currency: Currency; due: string }) => void;
}) {
  const store = useStore();
  const [type, setType] = useState<PaymentType>('balance');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [due, setDue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valid = Number(amount) > 0;

  // Only duty & freight have a scannable source doc.
  const scanKind: 'duty' | 'freight' | null =
    type === 'duty' ? 'duty' : type === 'freight' ? 'freight' : null;
  const scanLabel = scanKind === 'duty' ? 'Scan Bill of Entry (AI)' : 'Scan Freight Invoice (AI)';
  const docLabel = scanKind === 'duty' ? 'Bill of Entry' : 'Freight Invoice';

  async function docFileToFile(url: string, name: string): Promise<File> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], name || 'document', { type: blob.type });
  }

  async function scanFrom(f: File, kind: 'duty' | 'freight') {
    setScanning(true);
    setScanNote(null);
    try {
      const text = await extractText([f]);
      const r = await aiExtractPayment(kind, text);
      const outcome = interpretScan(r, docLabel);
      if (outcome.amount) setAmount(outcome.amount);
      if (outcome.currency) setCurrency(CURRENCY_SAFE(outcome.currency));
      setScanNote(outcome.note);
    } catch (e) {
      const msg = e instanceof AiError ? e.message : 'Scan failed — enter the amount manually.';
      store.toast(msg);
      setScanNote(msg);
    } finally {
      setScanning(false);
    }
  }

  async function runScan(kind: 'duty' | 'freight') {
    const docType = kind === 'duty' ? 'bill_of_entry' : 'freight_invoice';
    const existing = file.docs.find((d) => d.type === docType && d.fileUrl);
    if (existing?.fileUrl) {
      try {
        const f = await docFileToFile(existing.fileUrl, existing.fileName || docType);
        await scanFrom(f, kind);
      } catch {
        store.toast('Could not read the uploaded document.');
      }
      return;
    }
    fileInputRef.current?.click();
  }

  return (
    <Modal
      title="Add payment"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onAdd({ type, amount: Number(amount), currency, due });
              onClose();
            }}
          >
            Add payment
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as PaymentType)} className={inputCls}>
            {PAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {scanKind && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void scanFrom(f, scanKind);
              }}
            />
            <Button variant="ghost" disabled={scanning} onClick={() => void runScan(scanKind)}>
              {scanning ? 'Scanning…' : scanLabel}
            </Button>
            {scanNote && <p className="mt-1 text-xs text-muted">{scanNote}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-semibold text-muted">Amount</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Due date (optional)</span>
          <input value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} placeholder="e.g. 30 Jun 2026" />
        </label>
      </div>
    </Modal>
  );
}
```

Ensure `useRef` is in the React import at the top of the file (add if missing).

- [ ] **Step 4: Typecheck + full suite + build**

Run: `cd app && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc clean; ≥133 tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/FileDetail.tsx
git commit -m "feat(ai-scan): Scan BOE/Freight button in import AddPaymentModal"
```

---

### Task 4: Export UI — scan button in `ExportAddPaymentModal`

**Files:**
- Modify: `app/src/screens/ExportFileDetail.tsx` (call site ≈ line 205; `ExportAddPaymentModal` ≈ line 404-476)

**Interfaces:**
- Consumes: `interpretScan` (Task 1), `aiExtractPayment` (Task 2), `extractText` from `../lib/ocr`, `CURRENCY_SAFE` + `AiError` from `../lib/ai`, `store.toast`, `ExportFile` type.
- Produces: none downstream.

- [ ] **Step 1: Pass `file` to the modal**

At ≈ line 205, change:
```tsx
{addPay && (
  <ExportAddPaymentModal onClose={() => setAddPay(false)} onAdd={(p) => store.addPayment(file.id, p)} />
)}
```
to:
```tsx
{addPay && (
  <ExportAddPaymentModal file={file} onClose={() => setAddPay(false)} onAdd={(p) => store.addPayment(file.id, p)} />
)}
```

- [ ] **Step 2: Confirm imports in `ExportFileDetail.tsx`**

Ensure present (add any missing): `useRef` in the React import; `extractText` from `../lib/ocr`; `aiExtractPayment`, `CURRENCY_SAFE`, `AiError` from `../lib/ai`; `interpretScan` from `../lib/scanPayment`; `ExportFile` type; `useStore` (the export store hook — match whatever the parent uses; call inside the modal for `toast`).

- [ ] **Step 3: Rewrite `ExportAddPaymentModal` signature + body**

Replace the modal (≈ line 404-476) with:

```tsx
function ExportAddPaymentModal({
  file,
  onClose,
  onAdd,
}: {
  file: ExportFile;
  onClose: () => void;
  onAdd: (p: ExportAddPaymentInput) => void;
}) {
  const store = useStore();
  const [type, setType] = useState<ExportPaymentType>('balance_received');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [due, setDue] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const valid = Number(amount) > 0;

  // Export receivables are realized against the bank FIRC/BRC.
  const canScan = type === 'advance_received' || type === 'balance_received';
  const docLabel = 'FIRC/BRC';

  async function docFileToFile(url: string, name: string): Promise<File> {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], name || 'document', { type: blob.type });
  }

  async function scanFrom(f: File) {
    setScanning(true);
    setScanNote(null);
    try {
      const text = await extractText([f]);
      const r = await aiExtractPayment('firc', text);
      const outcome = interpretScan(r, docLabel);
      if (outcome.amount) setAmount(outcome.amount);
      if (outcome.currency) setCurrency(CURRENCY_SAFE(outcome.currency));
      setScanNote(outcome.note);
    } catch (e) {
      const msg = e instanceof AiError ? e.message : 'Scan failed — enter the amount manually.';
      store.toast(msg);
      setScanNote(msg);
    } finally {
      setScanning(false);
    }
  }

  async function runScan() {
    const existing = file.docs.find((d) => d.type === 'firc_brc' && d.fileUrl);
    if (existing?.fileUrl) {
      try {
        const f = await docFileToFile(existing.fileUrl, existing.fileName || 'firc_brc');
        await scanFrom(f);
      } catch {
        store.toast('Could not read the uploaded document.');
      }
      return;
    }
    fileInputRef.current?.click();
  }

  return (
    <Modal
      title="Add payment"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onAdd({ type, amount: Number(amount), currency, due });
              onClose();
            }}
          >
            Add payment
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as ExportPaymentType)} className={inputCls}>
            {EXPORT_PAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXPORT_PAYMENT_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {canScan && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void scanFrom(f);
              }}
            />
            <Button variant="ghost" disabled={scanning} onClick={() => void runScan()}>
              {scanning ? 'Scanning…' : 'Scan FIRC/BRC (AI)'}
            </Button>
            {scanNote && <p className="mt-1 text-xs text-muted">{scanNote}</p>}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-semibold text-muted">Amount</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Due date (optional)</span>
          <input value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} placeholder="e.g. 30 Jun 2026" />
        </label>
      </div>
    </Modal>
  );
}
```

If the export store hook is not named `useStore`, use the actual hook name the parent `ExportFileDetailBody` uses (check the top of the file). `store.toast` must exist on it; if the export store exposes toast under a different name, match it.

- [ ] **Step 4: Typecheck + full suite + build**

Run: `cd app && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc clean; ≥133 tests pass; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ExportFileDetail.tsx
git commit -m "feat(ai-scan): Scan FIRC/BRC button in export AddPaymentModal"
```

---

## Out of scope (deferred — do NOT build)
- Threading scanned `ref` into stored payments (4 signature changes).
- Shipping-bill FOB-value scan for export.
- `duty_challan` as a second duty source.
- Persisting the export scanned doc into the checklist (export has no doc-add UI — slice D).
- Auto-proposing payments in `BulkUpdateModal`.

## Self-Review notes
- Spec coverage: engine (T2), payment-type→doc map (T3 duty/freight, T4 firc), interpretScan test (T1), import UI (T3), export UI (T4), stores unchanged (constraint). ✅
- Type consistency: `PaymentExtract {amount,currency,ref}` identical in `api/ai.ts`, `app/lib/ai.ts`, used by `interpretScan`; `aiExtractPayment(kind:'duty'|'freight'|'firc', text)` matches route's `bad_kind` guard. ✅
- `CURRENCY_SAFE` coerces `interpretScan.currency` (string) → `Currency` before `setCurrency`. ✅
