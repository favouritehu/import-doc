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
{"file":{"country":"","mode":"sea|air","incoterm":"FOB|CIF|CFR|EXW|DAP|OTHER","blAwb":"","portLoading":"","portArrival":"","eta":"","shippingLine":"","forwarder":"","cha":""},
 "invoices":[{"supplier":"","invoiceNumber":"","invoiceDate":"","product":"","qty":"","hsn":"","amount":0,"currency":"USD|EUR|CNY|INR"}]}
Rules: One file may contain SEVERAL invoices (possibly from different suppliers) — return each as a separate item in "invoices". amount is a number (no symbols/commas). Use empty string for unknown fields. Translate Chinese field values to English where natural, but keep supplier names and invoice numbers verbatim. Do not invent values.`;

export async function extract(files: InputFile[]): Promise<ExtractResult> {
  if (!hasGemini()) throw new AiError('ai_not_configured: set GEMINI_API_KEY', 503);
  const parts: unknown[] = [{ text: EXTRACT_PROMPT }];
  for (const f of files) parts.push({ inline_data: { mime_type: f.mimeType, data: f.dataBase64 } });
  const raw = await geminiJson(parts);
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

export function aiStatus() {
  return {
    vision: visionConfigured(),
    text: textConfigured(),
    textProvider: textConfigured() ? textProvider() : null,
    geminiModel: GEMINI_MODEL(),
  };
}
