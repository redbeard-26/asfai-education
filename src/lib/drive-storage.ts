import { z } from "zod";
import { storageResource } from "@/lib/storage-resources";

// Locations and references for the Google Drive store. How to save there is
// described only in the asfai-storage-drive resource.

export const DRIVE_ROOT_FOLDER = "ASFAI";
export const DRIVE_STORE_MARKER = "asfai-store.json";

export const driveDocumentKinds = ["learner", "educator", "classroom"] as const;
export type DriveDocumentKind = (typeof driveDocumentKinds)[number];

const driveFileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, "A Google Drive file ID is required.");

// Mirrors normalizePersonalObjectPath so every store shares one layout.
export const driveObjectPathSchema = z.string().min(1).max(1000).refine((value) => {
  if (value.startsWith("/") || value.endsWith("/")) return false;
  return value.split("/").every((segment) => segment && segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/.test(segment));
}, "Drive object paths may contain only letters, digits, '.', '_', '-', and '/'.");

export const driveObjectReferenceSchema = z.object({
  storage: z.literal("google_drive"),
  fileId: driveFileIdSchema,
  path: driveObjectPathSchema,
  mediaType: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  bytes: z.number().int().nonnegative(),
  immutable: z.boolean().default(true),
  revisionId: z.string().min(1).max(200).optional(),
});

export type DriveObjectReference = z.infer<typeof driveObjectReferenceSchema>;

export const driveStoreMarkerSchema = z.object({
  schemaVersion: z.literal("0.1"),
  store: z.literal("google_drive"),
  layoutVersion: z.literal(1),
  createdAt: z.string(),
});

function driveLocation(relativePath: string, contentType: string, folderId?: string) {
  if (folderId) driveFileIdSchema.parse(folderId);
  return {
    mode: "google_drive" as const,
    location: `${DRIVE_ROOT_FOLDER}/${relativePath}`,
    folderId,
    contentType,
    requiredCapability: "host_google_drive",
    serverRetained: false,
    writeRequired: true,
    resource: storageResource("google_drive"),
  };
}

export function driveDocumentLocation(document: DriveDocumentKind, folderId?: string) {
  return driveLocation(`${document}.json`, "application/json", folderId);
}

export function driveObjectLocation(objectPath: string, contentType: string, folderId?: string) {
  return driveLocation(driveObjectPathSchema.parse(objectPath), contentType, folderId);
}
