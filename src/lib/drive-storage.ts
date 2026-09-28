import { z } from "zod";

// Google Drive is a host-side store: the AI assistant reads and writes the
// user's Drive with its own Google Drive connector. ASFAI never receives Drive
// credentials, never calls the Drive API, and never sees Drive file content.

export const DRIVE_ROOT_FOLDER = "ASFAI";
export const DRIVE_STORE_MARKER = "asfai-store.json";
export const DRIVE_HOST_CAPABILITY = "host_google_drive";

export const driveDocumentKinds = ["learner", "educator", "classroom"] as const;
export type DriveDocumentKind = (typeof driveDocumentKinds)[number];

const driveFileIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, "A Google Drive file ID is required.");

// Mirrors normalizePersonalObjectPath so Pod and Drive stores share one layout.
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

const commonRules = [
  "Use the assistant's own Google Drive connector. Never send Google passwords, tokens, or cookies to ASFAI, and never ask the user to paste them.",
  `Keep every ASFAI file inside the user's own '${DRIVE_ROOT_FOLDER}' folder in My Drive. Do not use a shared drive, and do not share any file unless the user explicitly confirms the recipient and access level.`,
  "Upload plain files (JSON as application/json, text as text/plain). Do not convert them to Google Docs, Sheets, or Slides, because conversion changes the exact content.",
  "Say data is saved only after reading the file back and confirming the content is identical to what was written. Otherwise say saving is still pending.",
];

const findStoreSteps = [
  `Find the store: search My Drive for a folder named '${DRIVE_ROOT_FOLDER}' that contains '${DRIVE_STORE_MARKER}'. Use the existing folder when one is found.`,
  `If none exists and the user agrees, create the '${DRIVE_ROOT_FOLDER}' folder in My Drive and upload '${DRIVE_STORE_MARKER}' containing {"schemaVersion":"0.1","store":"google_drive","layoutVersion":1,"createdAt":"<now>"}.`,
];

export function driveDocumentProcedure(document: DriveDocumentKind, folderId?: string) {
  if (folderId) driveFileIdSchema.parse(folderId);
  return {
    mode: "google_drive" as const,
    location: `${DRIVE_ROOT_FOLDER}/${document}.json`,
    folderId,
    contentType: "application/json",
    requiredCapability: DRIVE_HOST_CAPABILITY,
    serverRetained: false,
    writeRequired: true,
    steps: [
      ...(folderId ? [`Use the '${DRIVE_ROOT_FOLDER}' folder with ID '${folderId}'.`] : findStoreSteps),
      `Load: read '${document}.json' in that folder and parse it. If it does not exist, start from the state returned by asfai_storage action 'initialize'. Note the file's modified time.`,
      "Before saving, read the file's metadata again. If its modified time changed since loading, reload and reconcile instead of overwriting.",
      `Save: replace the content of '${document}.json' with the complete updated JSON, or create it in the folder if it does not exist.`,
      "Read the file back, parse it, and confirm it is identical to the JSON that was written.",
    ],
    rules: commonRules,
  };
}

export function driveObjectProcedure(objectPath: string, contentType: string, folderId?: string) {
  const path = driveObjectPathSchema.parse(objectPath);
  if (folderId) driveFileIdSchema.parse(folderId);
  const segments = path.split("/");
  const filename = segments.pop()!;
  return {
    mode: "google_drive" as const,
    location: `${DRIVE_ROOT_FOLDER}/${path}`,
    folderId,
    contentType,
    requiredCapability: DRIVE_HOST_CAPABILITY,
    serverRetained: false,
    writeRequired: true,
    steps: [
      ...(folderId ? [`Use the '${DRIVE_ROOT_FOLDER}' folder with ID '${folderId}'.`] : findStoreSteps),
      segments.length
        ? `Find or create the subfolders ${segments.map((segment) => `'${segment}'`).join(" / ")} inside '${DRIVE_ROOT_FOLDER}'.`
        : `Use the '${DRIVE_ROOT_FOLDER}' folder itself.`,
      `If a file named '${filename}' already exists there, do not overwrite it: saved objects are immutable. Choose the next version name instead.`,
      `Upload '${filename}' with content type '${contentType}'.`,
      "Read the file back and confirm its content and size match what was written.",
      `Reference it as {"storage":"google_drive","fileId":"<new file ID>","path":"${path}","mediaType":"${contentType}","bytes":<size>,"immutable":true}. Add 'sha256' only when Drive reports it.`,
    ],
    rules: commonRules,
  };
}
