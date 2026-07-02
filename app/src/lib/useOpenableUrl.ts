import { useEffect, useState } from 'react';
import { fetchBlobUrl } from './api';

// Turn a stored document reference into an openable URL:
//  - `srv:<key>`  -> server-stored file: fetch WITH auth, hand back an object URL.
//  - `data:` URL  -> legacy inline upload: Chrome blocks navigation/iframes to
//                    data: URLs, so convert to a blob object URL.
//  - http/blob    -> pass through.
// The object URL is revoked on unmount / when the source changes.
export function useOpenableUrl(src?: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!src) {
      setUrl(undefined);
      return;
    }

    // Server-stored file — fetch with the bearer token, then object-URL it.
    if (src.startsWith('srv:')) {
      let objUrl: string | null = null;
      let alive = true;
      fetchBlobUrl(src)
        .then((u) => {
          if (alive) {
            objUrl = u;
            setUrl(u);
          } else {
            URL.revokeObjectURL(u);
          }
        })
        .catch(() => alive && setUrl(undefined));
      return () => {
        alive = false;
        if (objUrl) URL.revokeObjectURL(objUrl);
      };
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
