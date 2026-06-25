// AI document extraction — combined providers.
//   Gemini  = vision (PDF + photo extraction, image discrepancy).
//   DeepSeek = cheap text (translate, text discrepancy).
// The API holds the keys; the browser never sees them. Every result is coerced
// to the app's enums/types — raw model output is never trusted.

const GEMINI_KEY = () => process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const DEEPSEEK_KEY = () => process.env.DEEPSEEK_API_KEY ?? '';
const DEEPSEEK_MODEL = () => process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export const hasGemini = (): boolean => GEMINI_KEY().length > 0;
export const hasDeepseek = (): boolean => DEEPSEEK_KEY().length > 0;
export const visionConfigured = (): boolean => hasGemini();
export const textConfigured = (): boolean => hasGemini() || hasDeepseek();

/** Which provider runs text-only tasks. */
function textProvider(): 'gemini' | 'deepseek' {
  const pref = (process.env.AI_TEXT_PROVIDER || 'auto').toLowerCase();
  if (pref === 'deepseek' && hasDeepseek()) return 'deepseek';
  if (pref === 'gemini' && hasGemini()) return 'gemini';
  // auto: prefer DeepSeek (cheaper) for text, fall back to Gemini
  if (hasDeepseek()) return 'deepseek';
  return 'gemini';
}

export interface InputFile {
  mimeType: string;
  dataBase64: string;
}

export class AiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

// ── Raw provider calls ────────────────────────────────────────────────

async function geminiJson(parts: unknown[]): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${GEMINI_KEY()}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new AiError(`Gemini request failed: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AiError(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`, 502);
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  return parseJson(text);
}

async function deepseekJson(system: string, user: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DEEPSEEK_KEY()}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 2000,
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new AiError(`DeepSeek request failed: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AiError(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`, 502);
  const data = (await res.json()) as any;
  return parseJson(data?.choices?.[0]?.message?.content ?? '');
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/[[{][\s\S]*[\]}]/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    throw new AiError('AI returned unparseable output', 422);
  }
}

// ── Coercion to app types ─────────────────────────────────────────────

const MODES = ['sea', 'air'];
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'OTHER'];
const CURRENCIES = ['USD', 'EUR', 'CNY', 'INR'];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

function coerceMode(v: unknown): 'sea' | 'air' {
  const s = str(v).toLowerCase();
  if (s.includes('air')) return 'air';
  return MODES.includes(s) ? (s as 'sea' | 'air') : 'sea';
}
function coerceIncoterm(v: unknown): string {
  const s = str(v).toUpperCase();
  return INCOTERMS.includes(s) ? s : 'OTHER';
}
function coerceCurrency(v: unknown): string {
  const s = str(v).toUpperCase().replace('US$', 'USD').replace('$', 'USD').replace('RMB', 'CNY').replace('¥', 'CNY').replace('₹', 'INR');
  return CURRENCIES.includes(s) ? s : 'USD';
}
function coerceAmount(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(str(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export interface ExtractedInvoice {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  product: string;
  qty: string;
  weight: string;
  hsn: string;
  amount: number;
  currency: string;
}
export interface ExtractResult {
  file: {
    country: string;
    mode: 'sea' | 'air';
    incoterm: string;
    blAwb: string;
    portLoading: string;
    portArrival: string;
    etd: string;
    eta: string;
    shippingLine: string;
    forwarder: string;
    cha: string;
  };
  invoices: ExtractedInvoice[];
}

function coerceExtract(raw: any): ExtractResult {
  const f = raw?.file ?? raw ?? {};
  const invSrc: any[] = Array.isArray(raw?.invoices) ? raw.invoices : Array.isArray(raw) ? raw : [raw];
  const invoices = invSrc
    .filter((i) => i && (i.supplier || i.invoiceNumber || i.amount))
    .map((i) => ({
      supplier: str(i.supplier),
      invoiceNumber: str(i.invoiceNumber ?? i.invoice_no ?? i.invoiceNo),
      invoiceDate: str(i.invoiceDate ?? i.date),
      product: str(i.product ?? i.goods ?? i.description),
      hsn: str(i.hsn ?? i.hsnCode ?? i.hs_code),
      qty: str(i.qty ?? i.quantity),
      weight: str(i.weight ?? i.grossWeight ?? i.netWeight ?? i.gross_weight ?? i.net_weight),
      amount: coerceAmount(i.amount ?? i.value ?? i.total),
      currency: coerceCurrency(i.currency ?? f.currency),
    }));
  return {
    file: {
      country: str(f.country ?? f.origin),
      mode: coerceMode(f.mode),
      incoterm: coerceIncoterm(f.incoterm),
      blAwb: str(f.blAwb ?? f.bl ?? f.awb ?? f.blNumber),
      portLoading: str(f.portLoading ?? f.pol),
      portArrival: str(f.portArrival ?? f.poa ?? f.destination),
      etd: str(f.etd ?? f.departure ?? f.etdDate),
      eta: str(f.eta),
      shippingLine: str(f.shippingLine ?? f.carrier),
      forwarder: str(f.forwarder),
      cha: str(f.cha),
    },
    invoices: invoices.length ? invoices : [],
  };
}

// ── Public tasks ──────────────────────────────────────────────────────

const EXTRACT_PROMPT = `You read import shipping documents (commercial invoices, proforma invoices, packing lists, bills of lading). Extract structured data and OUTPUT JSON ONLY in this exact shape:
{"file":{"country":"","mode":"sea|air","incoterm":"FOB|CIF|CFR|EXW|DAP|OTHER","blAwb":"","portLoading":"","portArrival":"","etd":"","eta":"","shippingLine":"","forwarder":"","cha":""},
 "invoices":[{"supplier":"","invoiceNumber":"","invoiceDate":"","product":"","qty":"","weight":"","hsn":"","amount":0,"currency":"USD|EUR|CNY|INR"}]}
Rules: One file may contain SEVERAL invoices (possibly from different suppliers) — return each as a separate item in "invoices". amount is a number (no symbols/commas). "weight" is the gross (or net) weight WITH its unit, e.g. "1,250 kg" — empty if absent. Use empty string for unknown fields. Translate Chinese field values to English where natural, but keep supplier names and invoice numbers verbatim. Do not invent values.`;

// Allowed document types the classifier must choose from (must match app docs.ts).
const DOC_TYPES = [
  'commercial_invoice', 'packing_list', 'proforma_invoice', 'purchase_order',
  'bill_of_lading', 'awb', 'certificate_of_origin', 'insurance_copy', 'coa',
  'payment_proof', 'bank_letter', 'freight_invoice', 'bill_of_entry',
  'duty_challan', 'assessment_copy', 'out_of_charge', 'delivery_order', 'other',
];

export interface ClassifyResult {
  docType: string; // one of DOC_TYPES
  title: string; // human label, e.g. "Commercial Invoice — Ningbo Foods"
  supplier: string; // for matching CI/PL to the right invoice line
  invoiceNumber: string;
  product: string;
  weight: string;
  confidence: number; // 0..1
}

const CLASSIFY_PROMPT = `You classify ONE uploaded import document. Identify its type and OUTPUT JSON ONLY:
{"docType":"<one of: ${DOC_TYPES.join(', ')}>","supplier":"","invoiceNumber":"","product":"","weight":"","confidence":0.0}
docType MUST be exactly one of the listed values; use "other" if none fit. Fill supplier/invoiceNumber/product/weight ONLY when the document is a commercial_invoice or packing_list (these route to a specific invoice line) — keep supplier and invoiceNumber verbatim; "weight" includes its unit (e.g. "1,250 kg"). confidence is your certainty 0..1. Do not invent values; use empty strings when unknown.`;

function coerceClassify(raw: any): ClassifyResult {
  const dt = str(raw?.docType).toLowerCase().replace(/[\s-]+/g, '_');
  const docType = DOC_TYPES.includes(dt) ? dt : 'other';
  const conf = typeof raw?.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
  return {
    docType,
    title: str(raw?.title) || '',
    supplier: str(raw?.supplier),
    invoiceNumber: str(raw?.invoiceNumber ?? raw?.invoice_no ?? raw?.invoiceNo),
    product: str(raw?.product ?? raw?.goods ?? raw?.description),
    weight: str(raw?.weight ?? raw?.grossWeight ?? raw?.netWeight),
    confidence: conf,
  };
}

/** Vision-classify a single uploaded document into a known doc type + slot hints. */
export async function classify(file: InputFile): Promise<ClassifyResult> {
  if (!hasGemini()) throw new AiError('ai_not_configured: set GEMINI_API_KEY', 503);
  const parts: unknown[] = [
    { text: CLASSIFY_PROMPT },
    { inline_data: { mime_type: file.mimeType, data: file.dataBase64 } },
  ];
  return coerceClassify(await geminiJson(parts));
}

export async function extract(files: InputFile[]): Promise<ExtractResult> {
  if (!hasGemini()) throw new AiError('ai_not_configured: set GEMINI_API_KEY', 503);
  const parts: unknown[] = [{ text: EXTRACT_PROMPT }];
  for (const f of files) parts.push({ inline_data: { mime_type: f.mimeType, data: f.dataBase64 } });
  const raw = await geminiJson(parts);
  return coerceExtract(raw);
}

/** Structure plain document TEXT (from client-side OCR / PDF text layer). Uses
 *  the text provider (DeepSeek preferred) — no vision/billing needed. */
export async function extractFromText(text: string): Promise<ExtractResult> {
  if (!textConfigured()) throw new AiError('ai_not_configured: set DEEPSEEK_API_KEY or GEMINI_API_KEY', 503);
  const user = `DOCUMENT TEXT (extracted by OCR — may have noise):\n${text}`;
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(EXTRACT_PROMPT, user)
      : await geminiJson([{ text: `${EXTRACT_PROMPT}\n\n${user}` }]);
  return coerceExtract(raw);
}

export interface Mismatch {
  field: string;
  invoiceValue: string;
  referenceValue: string;
  reasonZh: string;
  reasonEn: string;
}

const DISC_SYSTEM = `You compare a commercial invoice against a reference (proforma invoice / purchase order). Output JSON ONLY: {"mismatches":[{"field":"","invoiceValue":"","referenceValue":"","reasonZh":"","reasonEn":""}]}. reasonZh must be one of: 金额不符, 发票号不符, 提单号不符, 币种不符, 供应商名称不符, 缺少盖章, 缺少签字, 收货人错误, 其他. Only list real mismatches; empty array if they agree.`;

export async function discrepancy(invoiceFields: Record<string, unknown>, refText: string): Promise<Mismatch[]> {
  if (!textConfigured()) throw new AiError('ai_not_configured', 503);
  const user = `INVOICE FIELDS (already in system):\n${JSON.stringify(invoiceFields)}\n\nREFERENCE DOCUMENT TEXT:\n${refText}\n\nOutput the JSON described.`;
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(DISC_SYSTEM, user)
      : await geminiJson([{ text: `${DISC_SYSTEM}\n\n${user}` }]);
  const arr = (raw as any)?.mismatches;
  return Array.isArray(arr)
    ? arr.map((m: any) => ({
        field: str(m.field),
        invoiceValue: str(m.invoiceValue),
        referenceValue: str(m.referenceValue),
        reasonZh: str(m.reasonZh),
        reasonEn: str(m.reasonEn),
      }))
    : [];
}

export async function translate(text: string, to: 'en' | 'zh'): Promise<string> {
  if (!textConfigured()) throw new AiError('ai_not_configured', 503);
  const sys = `Translate the user's text to ${to === 'zh' ? 'Simplified Chinese' : 'English'}. Output JSON ONLY: {"text":"<translation>"}.`;
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(sys, text)
      : await geminiJson([{ text: `${sys}\n\nTEXT:\n${text}` }]);
  return str((raw as any)?.text) || text;
}

// ── Supplier chase message (bilingual) ────────────────────────────────

export interface ChaseInput {
  supplier: string;
  invoiceNumber?: string;
  fileNumber?: string;
  missing: string[]; // human labels of pending docs
  lang?: 'en' | 'zh' | 'both';
}

const CHASE_SYSTEM = `You write a short, polite follow-up message from an importer to their overseas supplier asking for missing shipping documents. Output JSON ONLY: {"text":"<message>"}. Default to BOTH English and Simplified Chinese (English first, then a 中文 version below). Be concise and friendly, address the supplier by name, reference the invoice/file number if given, and list exactly the pending documents. Do not invent documents or facts.`;

export async function chaseMessage(input: ChaseInput): Promise<string> {
  if (!textConfigured()) throw new AiError('ai_not_configured', 503);
  const lang = input.lang ?? 'both';
  const user = `Supplier: ${input.supplier || '(unknown)'}
Invoice: ${input.invoiceNumber || '-'}
File: ${input.fileNumber || '-'}
Pending documents: ${input.missing.length ? input.missing.join(', ') : '(none)'}
Language: ${lang === 'both' ? 'English + 中文' : lang === 'zh' ? '中文 only' : 'English only'}
Write the message.`;
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(CHASE_SYSTEM, user)
      : await geminiJson([{ text: `${CHASE_SYSTEM}\n\n${user}` }]);
  return str((raw as any)?.text);
}

// ── Paste-to-update: extract changed shipment fields from a message ────

export interface UpdateFields {
  etd?: string;
  eta?: string;
  blAwb?: string;
  shippingLine?: string;
  forwarder?: string;
  portLoading?: string;
  portArrival?: string;
}

const UPDATE_SYSTEM = `You read a supplier/forwarder WhatsApp or email message about a shipment and extract ONLY the shipment fields it states. Output JSON ONLY in this shape (omit a key or use "" if the message doesn't mention it):
{"etd":"YYYY-MM-DD","eta":"YYYY-MM-DD","blAwb":"","shippingLine":"","forwarder":"","portLoading":"","portArrival":""}
etd = departure/sailing/loaded date, eta = arrival date — output dates as YYYY-MM-DD. blAwb = Bill of Lading / AWB number. Do not invent values; only extract what is explicitly stated.`;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function coerceIsoDate(v: unknown): string {
  const s = str(v);
  if (!s) return '';
  if (ISO_RE.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function extractUpdate(text: string): Promise<UpdateFields> {
  if (!textConfigured()) throw new AiError('ai_not_configured', 503);
  const raw =
    textProvider() === 'deepseek'
      ? await deepseekJson(UPDATE_SYSTEM, `MESSAGE:\n${text}\n\nOutput the JSON described.`)
      : await geminiJson([{ text: `${UPDATE_SYSTEM}\n\nMESSAGE:\n${text}` }]);
  const r = (raw as any) ?? {};
  const out: UpdateFields = {};
  const etd = coerceIsoDate(r.etd ?? r.departure);
  const eta = coerceIsoDate(r.eta ?? r.arrival);
  if (etd) out.etd = etd;
  if (eta) out.eta = eta;
  const blAwb = str(r.blAwb ?? r.bl ?? r.awb);
  const shippingLine = str(r.shippingLine ?? r.carrier);
  const forwarder = str(r.forwarder);
  const portLoading = str(r.portLoading ?? r.pol);
  const portArrival = str(r.portArrival ?? r.poa ?? r.destination);
  if (blAwb) out.blAwb = blAwb;
  if (shippingLine) out.shippingLine = shippingLine;
  if (forwarder) out.forwarder = forwarder;
  if (portLoading) out.portLoading = portLoading;
  if (portArrival) out.portArrival = portArrival;
  return out;
}

export function aiStatus() {
  return {
    vision: visionConfigured(),
    text: textConfigured(),
    textProvider: textConfigured() ? textProvider() : null,
    geminiModel: GEMINI_MODEL(),
  };
}
