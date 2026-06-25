// Frontend AI client. Talks to the local api/ (which holds the keys) — the
// browser never sees an API key. Degrades with a friendly message when the API
// is down or unconfigured.

import type { Currency } from '../types';

const API = ((import.meta.env.VITE_API_URL as string) || 'http://localhost:8787').replace(/\/$/, '');

export class AiError extends Error {
  /** false => setup problem (API down / no key); true => upstream/model error. */
  recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.recoverable = recoverable;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('Cannot reach the AI service. Start it with `cd api && npm run dev`.', false);
  }
  if (res.status === 503) {
    throw new AiError('AI not configured — set GEMINI_API_KEY in api/.env and restart the API.', false);
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string };
    throw new AiError(j.message || `AI error (${res.status})`, true);
  }
  return res.json() as Promise<T>;
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

export interface ClassifyResult {
  docType: string;
  title: string;
  supplier: string;
  invoiceNumber: string;
  product: string;
  weight: string;
  confidence: number;
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

export interface Mismatch {
  field: string;
  invoiceValue: string;
  referenceValue: string;
  reasonZh: string;
  reasonEn: string;
}

function fileToPart(file: File): Promise<{ mimeType: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve({ mimeType: file.type || 'application/octet-stream', dataBase64: s.slice(s.indexOf(',') + 1) });
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function aiExtract(files: File[]): Promise<ExtractResult> {
  const parts = await Promise.all(files.map(fileToPart));
  return post<ExtractResult>('/ai/extract', { files: parts });
}

/** Vision-classify ONE uploaded document into a known doc type + slot hints. */
export async function aiClassify(file: File): Promise<ClassifyResult> {
  const part = await fileToPart(file);
  return post<ClassifyResult>('/ai/classify', { file: part });
}

/** Structure already-extracted document TEXT (from in-browser OCR) into fields. */
export async function aiExtractText(text: string): Promise<ExtractResult> {
  return post<ExtractResult>('/ai/extract-text', { text });
}

export async function aiDiscrepancy(
  invoice: Record<string, unknown>,
  refText: string,
): Promise<{ mismatches: Mismatch[] }> {
  return post('/ai/discrepancy', { invoice, refText });
}

export async function aiTranslate(text: string, to: 'en' | 'zh'): Promise<string> {
  const r = await post<{ text: string }>('/ai/translate', { text, to });
  return r.text;
}

export interface ChasePayload {
  supplier: string;
  invoiceNumber?: string;
  fileNumber?: string;
  missing: string[];
  lang?: 'en' | 'zh' | 'both';
}

/** Draft a bilingual supplier chase message for missing documents. */
export async function aiChase(payload: ChasePayload): Promise<string> {
  const r = await post<{ text: string }>('/ai/chase', payload);
  return r.text;
}

export interface UpdateFields {
  etd?: string;
  eta?: string;
  blAwb?: string;
  shippingLine?: string;
  forwarder?: string;
  portLoading?: string;
  portArrival?: string;
}

/** Extract changed shipment fields from a pasted supplier WhatsApp/email. */
export async function aiUpdate(text: string): Promise<UpdateFields> {
  const r = await post<{ fields: UpdateFields }>('/ai/update', { text });
  return r.fields;
}

export interface ReminderPayload {
  fileNumber: string;
  kind: 'etd' | 'eta';
  date: string;
  daysLeft: number;
  suppliers?: string[];
  product?: string;
  to?: { email?: string };
}

/** Fire a test shipment reminder through the n8n webhook (api holds the URL). */
export async function sendTestReminder(payload: ReminderPayload): Promise<void> {
  await post('/reminders/test', payload);
}

export const CURRENCY_SAFE = (c: string): Currency =>
  (['USD', 'EUR', 'CNY', 'INR'] as const).includes(c as Currency) ? (c as Currency) : 'USD';
