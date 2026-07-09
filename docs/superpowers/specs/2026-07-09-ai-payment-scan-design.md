# AI-scan payment amount (duty + freight)

## Goal
In Add Payment, stop hand-typing duty/freight amounts. Let AI read the Bill of
Entry (duty) or Freight Invoice (freight) already on the file and prefill the
amount, currency, and reference number.

## Scope
- **Duty** payment type → source doc = `bill_of_entry`.
- **Freight** payment type → source doc = `freight_invoice`.
- All other payment types (advance, balance, insurance, cha_charges,
  bank_charges, other) → no scan button, unchanged manual entry.
- No new doc-type source added (`duty_challan` not wired in this pass — same
  extraction pipeline can add it later as a second duty source).
- No bulk-upload auto-detection (that's the existing `BulkUpdateModal` flow,
  which proposes shipment-field updates only — payments are not proposed
  there in this pass).

## Why DeepSeek text, not Gemini vision
`GEMINI_API_KEY` is unset in production (out of credits, per HANDOFF.md).
`extract()`/`classify()` in `api/src/services/ai.ts` require `hasGemini()`
and 503 otherwise. The existing `BulkUpdateModal` avoids this by doing
OCR client-side (`app/src/lib/ocr.ts::extractText` — pdf.js text layer, falls
back to Tesseract for scanned PDFs/photos) and sending plain text to
DeepSeek (`extractFromText`/`classifyFromText`, gated on `textConfigured()`
which is true whenever `DEEPSEEK_API_KEY` is set). This feature reuses that
same client-OCR → DeepSeek-text pipeline, not the vision path.

## UX flow
1. In `AddPaymentModal`, when `type === 'duty'`, show a
   **"Scan Bill of Entry (AI)"** button under the Type field. When
   `type === 'freight'`, show **"Scan Freight Invoice (AI)"**. Other types:
   no button.
2. On click:
   - If the file already has that doc uploaded (`file.docs.find(d => d.type
     === 'bill_of_entry' && d.fileUrl)` or `'freight_invoice'`), fetch it
     directly — no re-upload.
   - Else, open a file picker. On selection: upload the file via the
     existing `uploadFile` + `addDocument` (files it into that doc slot, so
     the document checklist also gets satisfied), then proceed with the
     same file.
3. Run `extractText([file])` (existing OCR lib) → plain text.
4. Send text to `aiExtractPayment(kind, text)` → `{ amount, currency, ref }`.
5. Prefill the modal's Amount / Currency state from the result. Show a small
   inline note: "Read from Bill of Entry — verify before saving." Fields
   remain editable — this is a prefill, not a lock.
6. Errors (AI unreachable, unparseable, doc unreadable) → toast with the
   error message, fields stay as they were (blank or previously typed) so
   the user can still fill manually. Never blocks the Add button.
7. Button shows a spinner / "Scanning…" state while in flight; disabled
   during scan.

## Data flow / new pieces

### 1. `api/src/services/ai.ts`
New function, mirrors `extractFromText`'s shape:

```ts
export interface PaymentExtract {
  amount: number;
  currency: string; // USD|EUR|CNY|INR, coerceCurrency'd
  ref: string;       // challan no. / invoice no. found on the doc
}

const PAYMENT_PROMPTS: Record<'duty' | 'freight', string> = {
  duty: `You read an Indian customs Bill of Entry. Extract the TOTAL DUTY
PAYABLE (sum of BCD + IGST + Social Welfare Surcharge + any other customs
duty/cess — the final total duty amount, not the assessable/CIF value).
OUTPUT JSON ONLY: {"amount":0,"currency":"INR","ref":""}. Duty on a Bill of
Entry is always INR. ref = the Bill of Entry number. Do not invent values;
use 0/"" if genuinely absent.`,
  freight: `You read a freight invoice for an import shipment. Extract the
TOTAL FREIGHT AMOUNT CHARGED and its currency. OUTPUT JSON ONLY:
{"amount":0,"currency":"USD|EUR|CNY|INR","ref":""}. ref = the freight
invoice number. Do not invent values; use 0/"" if genuinely absent.`,
};

export async function extractPayment(kind: 'duty' | 'freight', text: string): Promise<PaymentExtract> {
  if (!textConfigured()) throw new AiError('ai_not_configured: set DEEPSEEK_API_KEY or GEMINI_API_KEY', 503);
  const user = `DOCUMENT TEXT (extracted by OCR — may have noise):\n${text.slice(0, 6000)}`;
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(PAYMENT_PROMPTS[kind], user)
      : await geminiJson([{ text: `${PAYMENT_PROMPTS[kind]}\n\n${user}` }]);
  const r = raw as any;
  return { amount: coerceAmount(r?.amount), currency: coerceCurrency(r?.currency ?? (kind === 'duty' ? 'INR' : 'USD')), ref: str(r?.ref) };
}
```

Reuses existing `coerceAmount`, `coerceCurrency`, `str`, `deepseekJson`,
`geminiJson`, `textConfigured`, `textProvider` — no new provider logic.

### 2. `api/src/routes/ai.ts`
New route, same shape as the existing `/ai/extract-text`:
```ts
POST /ai/extract-payment
body: { kind: 'duty' | 'freight', text: string }
-> extractPayment(kind, text)
```
Validate `kind` is one of the two literals (400 otherwise, matching the
route file's existing validation style).

### 3. `app/src/lib/ai.ts`
```ts
export interface PaymentExtract { amount: number; currency: string; ref: string }
export async function aiExtractPayment(kind: 'duty' | 'freight', text: string): Promise<PaymentExtract> {
  return post<PaymentExtract>('/ai/extract-payment', { kind, text });
}
```

### 4. `app/src/screens/FileDetail.tsx` — `AddPaymentModal`
- Add `file: ImportFile` to its props (parent call site at line ~384 already
  has `file` in scope — just pass it through).
- New local state: `scanning: boolean`, `scanNote: string | null`.
- New helper `docFileToFile(doc: Doc): Promise<File>`:
  ```ts
  const res = await fetch(doc.fileUrl!);
  const blob = await res.blob();
  return new File([blob], doc.fileName || 'document', { type: blob.type });
  ```
  (Works for both inline `data:` URLs and server-volume URLs — same
  fetch-as-blob approach `useOpenableUrl` already relies on elsewhere.)
- `runScan(kind: 'duty' | 'freight')`:
  1. Map kind → doc type (`'bill_of_entry'` | `'freight_invoice'`).
  2. Find existing doc on `file.docs`; if found and has `fileUrl`, use
     `docFileToFile`. Else, trigger a hidden file input (reuse the
     `UploadLabel` pattern already in this file) — on pick, `uploadFile` +
     `addDocument(file.id, { type: docType, label: docLabel(docType),
     fileName, fileUrl })`, then continue with the picked `File`.
  3. `setScanning(true)`, `extractText([file])`, `aiExtractPayment(kind,
     text)`.
  4. On success: `setAmount(String(result.amount))`,
     `setCurrency(CURRENCY_SAFE(result.currency))`, keep `ref` for later
     (payment `ref` field isn't in `AddPaymentModal`'s current `onAdd`
     signature — extend `onAdd`'s payload with optional `ref?: string` so
     it flows into `store.addPayment`, which already has a `ref` field on
     `Payment` (currently hardcoded `''`)).
  5. On error (`AiError` or fetch failure): toast/inline note, leave fields
     untouched, `setScanning(false)`.

### 5. `app/src/store/store.tsx`
- `addPayment(fileId, p: { type, amount, currency, due, ref? })` — thread
  `ref: p.ref ?? ''` into the constructed `Payment` instead of the current
  hardcoded `''`. One-line change at both branches (INR / non-INR).

## Error handling / edge cases
- Scanned PDF or photo with poor quality → OCR text noisy → DeepSeek may
  return `amount: 0` → `coerceAmount` still gives `0`; UI should treat a
  `0` result as "couldn't find it" and show the note "Couldn't read an
  amount — enter it manually" rather than silently filling `0`.
- User cancels the file picker (no doc yet, scan clicked) → no-op, no
  spinner stuck (standard `<input type=file>` cancel doesn't fire `onChange`,
  already the pattern used elsewhere in this file).
- Multiple invoices / multi-currency freight — not a concern here since
  freight invoice is a file-level doc (`isRequired`'s `freight_invoice` is
  already file-level, not per-invoice), one amount expected.

## Testing plan
- Unit: `extractPayment` coercion (mock `deepseekJson` response) — amount
  parses, currency coerces, defaults on missing fields (`vitest`, same
  pattern as existing `derive.test.ts`).
- Manual (no test harness for the API service currently): run
  `api/ src/services/ai.test.ts`-style check is skipped since none exists
  today for `ai.ts` — verify via `npm run dev` + a real BOE PDF, confirm
  `tsc --noEmit` and `vitest run` (91 → 92+ after adding a test) pass.
- Existing 91 tests must stay green; no changes to `derive.ts`/`rail.ts`
  logic.

## Out of scope (explicitly deferred)
- `duty_challan` as a second duty source.
- Auto-proposing payments inside `BulkUpdateModal`'s bulk scan flow.
- Editing/re-scanning an already-added payment row (this only prefills the
  Add flow).
