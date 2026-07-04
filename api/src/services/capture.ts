// One-click tracking capture (Chrome extension / paste): raw tracking-page text
// comes in, DeepSeek structures it, and we auto-match the shipment by any
// container/BL number found on the page — then patch the file's JSONB row.
// Free-path tracking: no Terminal49 quota involved.

import { query } from '../db';
import { extractUpdate } from './ai';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function todayDisplay(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const norm = (s: unknown): string =>
  typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

/** Candidate identifiers on the page: ISO container numbers + the AI-read BL. */
export function candidateNumbers(text: string, blFromAi?: string): string[] {
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/\b([A-Z]{4})\s?(\d{7})\b/g)) out.add(`${m[1]}${m[2]}`);
  if (blFromAi) out.add(norm(blFromAi));
  return [...out].filter(Boolean);
}

export interface CaptureResult {
  matched: { id: number; fileNumber: string } | null;
  applied: Record<string, string>;
  extracted: Record<string, string>;
}

export async function applyCapture(text: string): Promise<CaptureResult> {
  const upd = await extractUpdate(text); // DeepSeek -> {eta, arrivedOn, vessel, latestEvent, blAwb, ...}
  const extracted: Record<string, string> = {};
  for (const [k, v] of Object.entries(upd)) if (typeof v === 'string' && v) extracted[k] = v;

  const cands = candidateNumbers(text, upd.blAwb);
  const normText = norm(text);

  // Find the shipment: its container or BL appears among the page's numbers (or
  // anywhere in the page text — the tracked number is always shown on the page).
  const { rows } = await query<{ data: Record<string, unknown> }>('SELECT data FROM import_files');
  let match: Record<string, unknown> | null = null;
  for (const r of rows) {
    const f = r.data;
    const cont = norm(f.containerNo);
    const bl = norm(f.blAwb);
    const hit =
      (cont && (cands.includes(cont) || normText.includes(cont))) ||
      (bl && bl.length >= 6 && (cands.includes(bl) || normText.includes(bl)));
    if (hit) {
      match = f;
      break;
    }
  }
  if (!match) return { matched: null, applied: {}, extracted };

  // Patch only tracking-ish fields; the file stays the single source of truth.
  const applied: Record<string, string> = {};
  const patch = { ...match } as Record<string, unknown>;
  if (upd.etd) {
    patch.etd = upd.etd;
    applied.etd = upd.etd;
  }
  if (upd.eta) {
    patch.eta = upd.eta;
    applied.eta = upd.eta;
  }
  if (upd.arrivedOn) {
    patch.arrivedOn = upd.arrivedOn;
    applied.arrivedOn = upd.arrivedOn;
  }
  if (upd.vessel) {
    patch.vessel = upd.vessel;
    applied.vessel = upd.vessel;
  }
  if (upd.latestEvent) {
    patch.lastTrackingEvent = upd.latestEvent;
    applied.latestEvent = upd.latestEvent;
  }
  patch.lastTrackingAt = todayDisplay();

  await query(`UPDATE import_files SET data = $2, updated_at = now() WHERE id = $1`, [
    Number(match.id),
    JSON.stringify(patch),
  ]);

  return {
    matched: { id: Number(match.id), fileNumber: String(match.fileNumber ?? match.id) },
    applied,
    extracted,
  };
}
