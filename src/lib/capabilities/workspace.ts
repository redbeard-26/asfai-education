import { createHash } from "node:crypto";
import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });

export const educatorResourceSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  kind: z.enum(["document", "collection", "file", "artifact", "capability", "workflow", "room", "quiz", "feedback"]),
  status: z.enum(["draft", "published", "retired"]),
  content: z.unknown(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  parentVersionId: z.string().optional(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  provenance: z.object({
    author: z.string().max(300).optional(),
    capabilityId: z.string().optional(),
    capabilityVersion: z.string().optional(),
    sourceRefs: z.array(z.string()).default([]),
    license: z.string().max(300).optional(),
    aiGenerated: z.boolean().default(false),
  }),
});

export const collectionSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  resourceIds: z.array(z.string()).default([]),
  visibility: z.enum(["private", "shared", "public"]).default("private"),
  shareToken: z.string().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const educatorWorkspaceSchema = z.object({
  schemaVersion: z.literal("0.1"),
  educatorId: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  resources: z.record(z.string(), educatorResourceSchema),
  collections: z.record(z.string(), collectionSchema),
  history: z.array(z.object({
    id: z.string(),
    action: z.string(),
    targetId: z.string().optional(),
    occurredAt: timestampSchema,
  })).max(5000),
});

export type EducatorResource = z.infer<typeof educatorResourceSchema>;
export type EducatorWorkspace = z.infer<typeof educatorWorkspaceSchema>;

function uuidUrn() {
  return `urn:uuid:${crypto.randomUUID()}`;
}

function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
  if (input && typeof input === "object") return `{${Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`).join(",")}}`;
  return JSON.stringify(input) ?? "null";
}

function digest(content: unknown) {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function newEducatorWorkspace(educatorId = uuidUrn()): EducatorWorkspace {
  const now = new Date().toISOString();
  return { schemaVersion: "0.1", educatorId, createdAt: now, updatedAt: now, resources: {}, collections: {}, history: [] };
}

export function parseWorkspace(input?: unknown) {
  return input ? educatorWorkspaceSchema.parse(input) : newEducatorWorkspace();
}

function history(workspace: EducatorWorkspace, action: string, targetId?: string) {
  return [...workspace.history, { id: uuidUrn(), action, targetId, occurredAt: new Date().toISOString() }].slice(-5000);
}

export function createResource(workspaceInput: unknown, input: {
  title: string;
  kind?: EducatorResource["kind"];
  content: unknown;
  author?: string;
  capabilityId?: string;
  capabilityVersion?: string;
  sourceRefs?: string[];
  license?: string;
  aiGenerated?: boolean;
}) {
  const workspace = parseWorkspace(workspaceInput);
  const now = new Date().toISOString();
  const id = uuidUrn();
  const resource = educatorResourceSchema.parse({
    id,
    version: 1,
    title: input.title,
    kind: input.kind ?? "document",
    status: "draft",
    content: input.content,
    createdAt: now,
    updatedAt: now,
    digest: digest(input.content),
    provenance: {
      author: input.author,
      capabilityId: input.capabilityId,
      capabilityVersion: input.capabilityVersion,
      sourceRefs: input.sourceRefs ?? [],
      license: input.license,
      aiGenerated: input.aiGenerated ?? false,
    },
  });
  return {
    resource,
    workspace: {
      ...workspace,
      updatedAt: now,
      resources: { ...workspace.resources, [id]: resource },
      history: history(workspace, "resource.create", id),
    } satisfies EducatorWorkspace,
  };
}

export function versionResource(workspaceInput: unknown, resourceId: string, input: { title?: string; content: unknown }) {
  const workspace = parseWorkspace(workspaceInput);
  const existing = workspace.resources[resourceId];
  if (!existing) throw new Error(`No educator resource '${resourceId}'.`);
  const now = new Date().toISOString();
  const id = uuidUrn();
  const resource = educatorResourceSchema.parse({
    ...existing,
    id,
    version: existing.version + 1,
    title: input.title ?? existing.title,
    content: input.content,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    parentVersionId: existing.id,
    digest: digest(input.content),
  });
  return {
    resource,
    workspace: {
      ...workspace,
      updatedAt: now,
      resources: { ...workspace.resources, [id]: resource },
      history: history(workspace, "resource.version", id),
    } satisfies EducatorWorkspace,
  };
}

export function setResourceStatus(workspaceInput: unknown, resourceId: string, status: EducatorResource["status"]) {
  const workspace = parseWorkspace(workspaceInput);
  const existing = workspace.resources[resourceId];
  if (!existing) throw new Error(`No educator resource '${resourceId}'.`);
  const now = new Date().toISOString();
  const resource = educatorResourceSchema.parse({ ...existing, status, updatedAt: now });
  return {
    resource,
    workspace: {
      ...workspace,
      updatedAt: now,
      resources: { ...workspace.resources, [resourceId]: resource },
      history: history(workspace, `resource.${status}`, resourceId),
    } satisfies EducatorWorkspace,
  };
}

export function deleteResource(workspaceInput: unknown, resourceId: string) {
  const workspace = parseWorkspace(workspaceInput);
  if (!workspace.resources[resourceId]) throw new Error(`No educator resource '${resourceId}'.`);
  const resources = { ...workspace.resources };
  delete resources[resourceId];
  const collections = Object.fromEntries(Object.entries(workspace.collections).map(([id, collection]) => [
    id,
    { ...collection, resourceIds: collection.resourceIds.filter((item) => item !== resourceId) },
  ]));
  return {
    deleted: resourceId,
    workspace: { ...workspace, updatedAt: new Date().toISOString(), resources, collections, history: history(workspace, "resource.delete", resourceId) } satisfies EducatorWorkspace,
  };
}

export function searchWorkspace(workspaceInput: unknown, query = "") {
  const workspace = parseWorkspace(workspaceInput);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.values(workspace.resources).filter((resource) => {
    const haystack = `${resource.id} ${resource.title} ${resource.kind} ${resource.status}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  }).map((resource) => ({
    id: resource.id,
    version: resource.version,
    title: resource.title,
    kind: resource.kind,
    status: resource.status,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    parentVersionId: resource.parentVersionId,
    digest: resource.digest,
    provenance: resource.provenance,
  }));
}

export function createCollection(workspaceInput: unknown, input: { title: string; description?: string; resourceIds?: string[] }) {
  const workspace = parseWorkspace(workspaceInput);
  const now = new Date().toISOString();
  const id = uuidUrn();
  for (const resourceId of input.resourceIds ?? []) {
    if (!workspace.resources[resourceId]) throw new Error(`No educator resource '${resourceId}'.`);
  }
  const collection = collectionSchema.parse({ id, ...input, resourceIds: input.resourceIds ?? [], createdAt: now, updatedAt: now });
  return {
    collection,
    workspace: { ...workspace, updatedAt: now, collections: { ...workspace.collections, [id]: collection }, history: history(workspace, "collection.create", id) } satisfies EducatorWorkspace,
  };
}

export function updateCollection(workspaceInput: unknown, collectionId: string, input: { title?: string; description?: string; resourceIds?: string[]; visibility?: "private" | "shared" | "public"; revoke?: boolean }) {
  const workspace = parseWorkspace(workspaceInput);
  const existing = workspace.collections[collectionId];
  if (!existing) throw new Error(`No collection '${collectionId}'.`);
  for (const resourceId of input.resourceIds ?? existing.resourceIds) {
    if (!workspace.resources[resourceId]) throw new Error(`No educator resource '${resourceId}'.`);
  }
  const now = new Date().toISOString();
  const visibility = input.revoke ? "private" : input.visibility ?? existing.visibility;
  const collection = collectionSchema.parse({
    ...existing,
    ...input,
    visibility,
    shareToken: visibility === "private" ? undefined : existing.shareToken ?? crypto.randomUUID(),
    updatedAt: now,
  });
  return {
    collection,
    workspace: { ...workspace, updatedAt: now, collections: { ...workspace.collections, [collectionId]: collection }, history: history(workspace, input.revoke ? "collection.revoke" : "collection.update", collectionId) } satisfies EducatorWorkspace,
  };
}
