// Carrier name -> SCAC (the 4-letter code Terminal49 needs). Importers know the
// line name ("Maersk"), not the SCAC, so we resolve it from the shipping-line text
// on the import file, and offer this list as a dropdown when we can't.

export interface Carrier {
  scac: string;
  name: string;
  aliases: string[]; // lowercase substrings that identify the line
}

export const CARRIERS: Carrier[] = [
  { scac: 'MAEU', name: 'Maersk', aliases: ['maersk', 'maeu', 'sealand', 'safmarine'] },
  { scac: 'MSCU', name: 'MSC', aliases: ['msc', 'mediterranean shipping'] },
  { scac: 'CMDU', name: 'CMA CGM', aliases: ['cma', 'cgm', 'cma cgm', 'anl'] },
  { scac: 'HLCU', name: 'Hapag-Lloyd', aliases: ['hapag', 'hlcu', 'hapag-lloyd'] },
  { scac: 'ONEY', name: 'ONE', aliases: ['ocean network', 'one line', 'oney', ' one '] },
  { scac: 'COSU', name: 'COSCO', aliases: ['cosco', 'cosu'] },
  { scac: 'EGLV', name: 'Evergreen', aliases: ['evergreen', 'eglv'] },
  { scac: 'OOLU', name: 'OOCL', aliases: ['oocl', 'oolu'] },
  { scac: 'YMLU', name: 'Yang Ming', aliases: ['yang ming', 'ymlu'] },
  { scac: 'HDMU', name: 'HMM', aliases: ['hmm', 'hyundai merchant', 'hdmu'] },
  { scac: 'ZIMU', name: 'ZIM', aliases: ['zim', 'zimu'] },
  { scac: 'PABV', name: 'PIL', aliases: ['pacific international', 'pil ', 'pabv'] },
  { scac: 'WHLC', name: 'Wan Hai', aliases: ['wan hai', 'whlc'] },
  { scac: 'SUDU', name: 'Hamburg Süd', aliases: ['hamburg', 'sudu', 'hamburg sud'] },
  { scac: 'APLU', name: 'APL', aliases: ['apl ', 'american president', 'aplu'] },
];

const norm = (s: string): string => ` ${(s || '').toLowerCase().trim()} `;

/** Resolve a shipping-line name (or an already-SCAC string) to a SCAC, or null. */
export function scacFor(line: string | undefined | null): string | null {
  if (!line) return null;
  const s = norm(line);
  const raw = line.trim().toUpperCase();
  // Already a valid SCAC?
  if (CARRIERS.some((c) => c.scac === raw)) return raw;
  for (const c of CARRIERS) {
    if (c.aliases.some((a) => s.includes(a))) return c.scac;
  }
  // 4-letter uppercase token that looks like a SCAC — accept it.
  if (/^[A-Z]{4}$/.test(raw)) return raw;
  return null;
}

export const carrierName = (scac: string): string =>
  CARRIERS.find((c) => c.scac === scac)?.name ?? scac;
