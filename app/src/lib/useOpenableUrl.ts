import { useEffect, useState } from 'react';

// Uploaded files are stored as `data:` URLs (so they persist to IndexedDB and
// survive reload). But Chrome blocks top-level navigation AND iframes to `data:`
// URLs (anti-phishing) — a stored PDF would refuse to open. So at view time we
// convert the data URL into a short-lived blob object URL, which opens and embeds
// for any MIME type (PDF included). Pass-through for http/blob URLs. The object
// URL is revoked on unmount / when the source changes.
export function useOpenableUrl(src?: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!src) {
      setUrl(undefined);
      return;
    }
    if (!src.startsWith('data:')) {
      setUrl(src);
      return;
    }
    let objUrl: string | null = null;
    try {
      const comma = src.indexOf(',');
      const head = src.slice(5, comma); // strip "data:"
      const mime = head.split(';')[0] || 'application/octet-stream';
      const bin = atob(src.slice(comma + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      objUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      setUrl(objUrl);
    } catch {
      setUrl(src);
    }
    return () => {
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [src]);
  return url;
}
