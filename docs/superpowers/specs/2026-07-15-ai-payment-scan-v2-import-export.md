# AI payment-amount scan — v2 (import + export)

Supersedes `2026-07-09-ai-payment-scan-design.md` (import-only, written at the
91-test baseline). This version is reconciled against the **current** code
(129-test baseline, post Export-Desk-switcher merge `83bdf80`) and extends the
feature to the **export** desk. Build both desks in one slice (slice **C**).

## Goal
In Add Payment (both desks), stop hand-typing the amount. Let AI read a source
document already on the file (or one the user picks) and prefill amount +
currency (+ capture the reference number). Prefill, never lock — always editable.

## Engine (unchanged decision)
Client OCR → DeepSeek text. NEVER Gemini vision (`GEMINI_API_KEY` dead in prod).
`app/src/lib/ocr.ts::extractText(files: File[]): Promise<string>` (pdf.js text
layer → Tesseract fallback) → new `/ai/extract-payment` route → DeepSeek JSON.

## Payment-type → source-doc mapping

### Import (`FileDetail.tsx` `AddPaymentModal`, `PaymentType`)
| type | scan? | source doc type | currency |
|------|-------|-----------------|----------|
| `duty` | ✅ "Scan Bill of Entry (AI)" | `bill_of_entry` | always INR |
| `freight` | ✅ "Scan Freight Invoice (AI)" | `freight_invoice` | USD/EUR/CNY/INR |
| advance/balance/insurance/cha_charges/bank_charges/other | ❌ manual | — | — |

### Export (`ExportFileDetail.tsx` `ExportAddPaymentModal`, `ExportPaymentType`)
| type | scan? | source doc type | currency |
|------|-------|-----------------|----------|
| `advance_received` | ✅ "Scan FIRC/BRC (AI)" | `firc_brc` | USD/EUR/CNY/INR |
| `balance_received` | ✅ "Scan FIRC/BRC (AI)" | `firc_brc` | USD/EUR/CNY/INR |
| freight/insurance/cha_charges/bank_charges/other | ❌ manual | — | — |

Rationale: export receivables are realized against the bank's FIRC/BRC (Foreign
Inward Remittance Cert / Bank Realization Cert), which carries the received
amount + currency. There is **no export freight-invoice doc type** and freight
on the export side is a payable with no source doc, so no scan for it.
(Shipping-bill FOB scan deferred — out of scope, see below.)

## Current-code realities the v1 spec got wrong (from 2026-07-15 Explore map)

1. **Backend helpers are module-private.** In `api/src/services/ai.ts`:
   `deepseekJson` (L69), `geminiJson` (L42), `textProvider` (L18),
   `coerceAmount` (L137), `coerceCurrency` (L133), `str` (L122) are NOT
   exported. `extractPayment` MUST be a new function **inside `ai.ts`** (same
   module) so it can call them. Only `textConfigured` (L15), `AiError` (L32,
   ctor `(message, status=502)`) are exported. Do NOT try to import the private
   helpers elsewhere.
2. **`onAdd`/`addPayment` do NOT accept `ref`.** Threading the scanned ref
   requires signature changes in 4 places — but `ref` is OPTIONAL polish, not
   core. **Decision: DEFER `ref` threading.** v2 prefills amount + currency
   only; the scanned ref is dropped (both `Payment.ref` / `ExportPayment.ref`
   stay `''` as today). This avoids 4 coupled signature edits for marginal
   value. (Re-add later if wanted.)
3. **Export desk has NO document-upload UI.** The export `DocumentChecklist` is
   read-only — no `AddDocumentModal`, no `uploadFile`/`addDocument` on that
   screen. So the export scan's "no doc yet → pick a file" path needs a minimal
   file-pick+OCR inline in `ExportAddPaymentModal` (it does NOT need to persist
   the doc into the checklist — scan the picked File directly). Import's
   `AddDocumentModal` (`FileDetail.tsx` L1121) is the upload-pattern template,
   but for the scan we only need File → `extractText` → `aiExtractPayment`, not
   a full `addDocument`. Keep it minimal: hidden `<input type=file>`, read the
   picked File, OCR it, discard.
   - Import side DOES have `store.uploadFile` + `store.addDocument`, so import's
     scan MAY file the doc into the slot (bonus: satisfies checklist). Optional;
     the core path is still File → OCR → extract.
4. **Frontend `AiError` (recoverable:boolean) ≠ backend `AiError` (status:number).**
   Don't conflate. Client catches the frontend one.
5. **Modals are untested** (SSR `renderToStaticMarkup` never flips state). New
   modal UI won't be covered by render tests and won't break them. The
   meaningful unit test target is the pure extractor coercion.

## New pieces

### 1. `api/src/services/ai.ts` — `extractPayment` (new, in-module)
```ts
export interface PaymentExtract { amount: number; currency: string; ref: string }

const PAYMENT_PROMPTS: Record<'duty' | 'freight' | 'firc', string> = {
  duty: `You read an Indian customs Bill of Entry. Extract the TOTAL DUTY
PAYABLE (BCD + IGST + Social Welfare Surcharge + any other customs duty/cess —
the final total duty, NOT the assessable/CIF value). OUTPUT JSON ONLY:
{"amount":0,"currency":"INR","ref":""}. Duty is always INR. ref = Bill of Entry
number. Do not invent values; use 0/"" if genuinely absent.`,
  freight: `You read a freight invoice for a shipment. Extract the TOTAL FREIGHT
AMOUNT CHARGED and its currency. OUTPUT JSON ONLY:
{"amount":0,"currency":"USD|EUR|CNY|INR","ref":""}. ref = freight invoice
number. Do not invent values; use 0/"" if genuinely absent.`,
  firc: `You read a bank FIRC/BRC (Foreign Inward Remittance / Bank Realization
Certificate) for an export. Extract the REMITTANCE AMOUNT RECEIVED and its
currency. OUTPUT JSON ONLY: {"amount":0,"currency":"USD|EUR|CNY|INR","ref":""}.
ref = FIRC/BRC reference number. Do not invent values; use 0/"" if absent.`,
};

export async function extractPayment(
  kind: 'duty' | 'freight' | 'firc', text: string,
): Promise<PaymentExtract> {
  if (!textConfigured()) throw new AiError('ai_not_configured: set DEEPSEEK_API_KEY', 503);
  const user = `DOCUMENT TEXT (OCR — may have noise):\n${text.slice(0, 6000)}`;
  const dflt = kind === 'duty' ? 'INR' : 'USD';
  const raw = textProvider() === 'deepseek'
    ? await deepseekJson(PAYMENT_PROMPTS[kind], user)
    : await geminiJson([{ text: `${PAYMENT_PROMPTS[kind]}\n\n${user}` }]);
  const r = raw as any;
  return { amount: coerceAmount(r?.amount), currency: coerceCurrency(r?.currency ?? dflt), ref: str(r?.ref) };
}
```
(3 kinds now: duty, freight — import; firc — export.)

### 2. `api/src/routes/ai.ts` — `POST /ai/extract-payment`
Match the `/extract-text` style (manual cast + guard):
```ts
app.post('/extract-payment', async (req, reply) => {
  const b = req.body as { kind?: string; text?: string };
  if (b?.kind !== 'duty' && b?.kind !== 'freight' && b?.kind !== 'firc')
    return reply.code(400).send({ error: 'bad_kind' });
  if (!b?.text?.trim()) return reply.code(400).send({ error: 'no_text' });
  return extractPayment(b.kind, b.text);
});
```

### 3. `app/src/lib/ai.ts` — `aiExtractPayment`
```ts
export interface PaymentExtract { amount: number; currency: string; ref: string }
export async function aiExtractPayment(
  kind: 'duty' | 'freight' | 'firc', text: string,
): Promise<PaymentExtract> {
  return post<PaymentExtract>('/ai/extract-payment', { kind, text });
}
```

### 4. Import UI — `FileDetail.tsx` `AddPaymentModal`
- Add prop `file: ImportFile` (call site L384 has `file` in scope — pass it).
- State: `scanning: boolean`, `scanNote: string | null`.
- When `type === 'duty'` show "Scan Bill of Entry (AI)"; `type === 'freight'`
  show "Scan Freight Invoice (AI)"; else no button.
- `runScan(kind)`: map kind→docType (`bill_of_entry`|`freight_invoice`); if
  `file.docs.find(d => d.type === docType && d.fileUrl)` → fetch as blob →
  `File`; else hidden file input, use picked File. `setScanning(true)`,
  `extractText([f])`, `aiExtractPayment(kind==='duty'?'duty':'freight', text)`.
  On success with `amount > 0`: `setAmount(String(amount))`,
  `setCurrency(CURRENCY_SAFE(currency))`, note "Read from <doc> — verify before
  saving." On `amount === 0`: note "Couldn't read an amount — enter manually."
  On error (frontend `AiError`/fetch): toast + note, fields untouched. Always
  `finally setScanning(false)`. Button disabled + "Scanning…" while in flight.
- `docFileToFile(url, name)`: `fetch(url) → blob → new File([blob], name, {type})`.

### 5. Export UI — `ExportFileDetail.tsx` `ExportAddPaymentModal`
- Add prop `file: ExportFile` (call site L205 has `file`).
- Same `scanning`/`scanNote` state + `docFileToFile` helper.
- When `type === 'advance_received' || type === 'balance_received'` show
  "Scan FIRC/BRC (AI)"; else no button.
- `runScan('firc')`: docType = `firc_brc`; existing doc on `file.docs`? fetch as
  blob; else hidden file input → picked File (do NOT persist — export has no doc
  store mutation; just OCR the File). `extractText([f])`,
  `aiExtractPayment('firc', text)`. Same success/zero/error handling.
- Currency default USD; amount editable.

### 6. Stores — NO change (ref deferred, per reality #2).

## Testing
- **Decision (firm): extract a pure `interpretScan` helper and unit-test it.**
  Backend `ai.ts` runs under Node/Fastify (no vitest project); modals are SSR-
  untested. So put the testable logic in a pure frontend helper both modals call:
  ```ts
  // app/src/lib/scanPayment.ts
  import type { PaymentExtract } from './ai';
  export interface ScanOutcome { amount?: string; currency?: string; note: string }
  export function interpretScan(r: PaymentExtract, docLabel: string): ScanOutcome {
    if (!r || r.amount <= 0) return { note: "Couldn't read an amount — enter it manually." };
    return { amount: String(r.amount), currency: r.currency, note: `Read from ${docLabel} — verify before saving.` };
  }
  ```
  Test `app/src/test/scanPayment.test.ts`: amount>0 → returns amount+currency+verify
  note; amount 0 / negative / null → note-only "enter manually", no amount. Both
  `AddPaymentModal.runScan` and `ExportAddPaymentModal.runScan` route their
  `aiExtractPayment` result through `interpretScan` and apply `.amount`/`.currency`
  (via `CURRENCY_SAFE`) when present, always show `.note`. Keep ≥129 green; add ≥3.
- Manual: `npm run dev`, real BOE / FIRC PDF, confirm prefill. `tsc --noEmit` +
  `vitest run` + `npm run build` clean.

## Out of scope (deferred)
- Threading scanned `ref` into stored payments (4 signature changes).
- Shipping-bill FOB-value scan for export.
- `duty_challan` as a second duty source.
- Persisting the export scanned doc into the checklist (export has no doc-add UI;
  building that is a separate item — belongs to slice D).
- Auto-proposing payments in `BulkUpdateModal`.

## Constraints
- Additive/surgical. No change to derive engines, status derivation, §0 role
  gating. Scan buttons live INSIDE the payments modal, which on both desks is
  already behind `canFin` (financial-role) — so scan is implicitly role-gated too.
