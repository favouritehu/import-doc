// File storage — keeps uploaded documents OUT of the database. The DB row holds
// only a short reference (`srv:<key>`); the bytes live on a disk volume, streamed
// back through the guarded /files/blob/:key route.
//
// Backend is disk today (UPLOADS_DIR, a persistent Coolify volume). The interface
// is deliberately small (put / read / contentType) so an S3 backend can drop in
// later with no route/client changes.

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream, type ReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, extname } from 'node:path';

const DIR = (): string => process.env.UPLOADS_DIR || '/data/uploads';

// key = uuid + ext, nothing else. Rejects path traversal / nested paths.
const KEY_RE = /^[a-f0-9-]{36}(\.[a-z0-9]{1,8})?$/i;
export function validKey(key: string): boolean {
  return typeof key === 'string' && KEY_RE.test(key);
}

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
};
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

function pickExt(name: string, mime: string): string {
  const fromName = extname(name || '').toLowerCase();
  if (fromName && MIME_BY_EXT[fromName]) return fromName;
  return EXT_BY_MIME[mime] || fromName || '';
}

/** Store base64 bytes, return the opaque key to persist on the document. */
export async function putObject(dataBase64: string, mime: string, name: string): Promise<{ key: string }> {
  const dir = DIR();
  await mkdir(dir, { recursive: true });
  const key = `${randomUUID()}${pickExt(name, mime)}`;
  await writeFile(join(dir, key), Buffer.from(dataBase64, 'base64'));
  return { key };
}

export function contentTypeFor(key: string): string {
  return MIME_BY_EXT[extname(key).toLowerCase()] || 'application/octet-stream';
}

/** Open a stored object for streaming. Throws if the key is invalid or missing. */
export async function readObject(key: string): Promise<{ stream: ReadStream; size: number; contentType: string }> {
  if (!validKey(key)) throw new Error('invalid_key');
  const path = join(DIR(), key);
  const s = await stat(path); // throws ENOENT if absent
  return { stream: createReadStream(path), size: s.size, contentType: contentTypeFor(key) };
}
