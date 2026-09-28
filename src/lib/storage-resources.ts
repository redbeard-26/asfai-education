// Saving instructions live only in the storage resources (skills) named here.
// Code and other guidance point to them instead of describing a saving method.

export const STORAGE_RESOURCES = {
  solid_pod: "asfai-storage-pod",
  google_drive: "asfai-storage-drive",
  indexeddb: "asfai-storage-local",
  local_file: "asfai-storage-local",
} as const;

export type StorageMode = keyof typeof STORAGE_RESOURCES;

export const STORAGE_HOST_CAPABILITIES = {
  solid_pod: "authenticated_solid_fetch",
  google_drive: "host_google_drive",
  indexeddb: "browser_indexeddb",
  local_file: "local_filesystem",
} as const;

export const STORAGE_RULE =
  "Save private data only in the user's own store by following that store's storage resource (asfai_capability action get_skill: asfai-storage-pod, asfai-storage-drive, or asfai-storage-local). If the store is not known, ask the user where to save. Say data is saved only after the resource's read-back check succeeds.";

export function storageResource(mode: StorageMode) {
  const name = STORAGE_RESOURCES[mode];
  return { name, tool: "asfai_capability", action: "get_skill", payload: { name } };
}
