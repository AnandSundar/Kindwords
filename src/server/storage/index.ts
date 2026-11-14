import { getConfig, type StorageConfig } from "@/server/config";
import { newId } from "@/server/db/ids";
import { localStorage } from "./local";
import { s3Storage } from "./s3";

/** Blob storage by key (KTD8). `get` resolves to null when the key does not exist. */
export type Storage = {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<ReadableStream<Uint8Array> | null>;
  delete(key: string): Promise<void>;
};

/** Keys are random base64url, never derived from user filenames, so no separator or `..` can appear. */
export const newMediaKey = newId;

export function isValidKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(key);
}

export function assertValidKey(key: string): void {
  if (!isValidKey(key)) throw new Error(`Invalid storage key ${JSON.stringify(key)}.`);
}

export function createStorage(config: StorageConfig): Storage {
  return config.driver === "local" ? localStorage(config.uploadsDir) : s3Storage(config);
}

let shared: Storage | undefined;

/** The app-wide storage, chosen by STORAGE_DRIVER (R22). */
export function getStorage(): Storage {
  return (shared ??= createStorage(getConfig().storage));
}
