// Deterministic magic-link tokens for Phase A (replaced by signed, revocable
// tokens in Phase B). Stable per file+party so a re-render keeps the same URL.

import type { Party } from '../types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function linkToken(fileNumber: string, party: Party): string {
  const a = hash(`${fileNumber}:${party}`).toString(16).padStart(8, '0');
  const b = hash(`${party}:${fileNumber}:salt`).toString(16).slice(0, 3);
  return `${a}${b}`;
}

/** Forwarder & supplier share one route (`fwd`); CHA gets its own. */
export function magicPath(fileNumber: string, party: Party, lang?: 'zh'): string {
  const seg = party === 'cha' ? 'cha' : 'fwd';
  const q = lang === 'zh' && party !== 'cha' ? '?lang=zh' : '';
  return `/u/${fileNumber}/${seg}/${linkToken(fileNumber, party)}${q}`;
}

export const EXPIRY_LABEL = 'Expires 01 Jul 2026 · revocable';
