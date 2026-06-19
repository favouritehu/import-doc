// One interface over local disk or S3-compatible storage. Phase A defines the
// contract; the real upload picker + driver land in Phase B.

export interface StorageService {
  put(key: string, body: Buffer, contentType: string): Promise<{ key: string }>;
  getUrl(key: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export function storageDriver(): string {
  return process.env.STORAGE_DRIVER ?? 'local';
}

// Phase B: return a LocalDiskStorage or S3Storage based on storageDriver().
export function getStorage(): StorageService {
  throw new Error('storageService: driver not wired in Phase A');
}
