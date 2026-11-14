import { getConfig, type StorageConfig } from "@/server/config";
import type { Storage } from "./key";
import { localStorage } from "./local";
import { s3Storage } from "./s3";

export { assertValidKey, isValidKey, newMediaKey, type Storage } from "./key";

export function createStorage(config: StorageConfig): Storage {
  return config.driver === "local" ? localStorage(config.uploadsDir) : s3Storage(config);
}

let shared: Storage | undefined;

/** The app-wide storage, chosen by STORAGE_DRIVER (R22). */
export function getStorage(): Storage {
  return (shared ??= createStorage(getConfig().storage));
}
