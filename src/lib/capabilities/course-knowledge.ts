import { createHash } from "node:crypto";
import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/i);

function uuidUrn() {
  return `urn:uuid:${crypto.randomUUID()}`;
}

function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(",")}]`;
  if (input && typeof input === "object") {
    return `{${Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`)
      .join(",")}}`;
  }
  return JSON.stringify(input) ?? "null";
}

export function courseContentDigest(input: unknown) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export const podObjectReferenceSchema = z.object({
  storage: z.literal("solid_pod"),
  href: z.string().url().refine((value) => new URL(value).protocol === "https:", "Pod references must use HTTPS."),
  mediaType: z.string().min(1).max(200),
  sha256: digestSchema,
  bytes: z.number().int().nonnegative(),
  immutable: z.boolean().default(true),
});

export type PodObjectReference = z.infer<typeof podObjectReferenceSchema>;

export const objectiveAlignmentSchema = z.object({
  objectiveId: z.string().min(1),
  alignmentType: z.enum(["teaches", "assesses", "supports"]),
  confidence: z.number().min(0).max(1).optional(),
  confirmedByEducator: z.boolean().default(false),
  rationale: z.string().min(1).max(2000),
  source: z.string().min(1).max(500),
});

export const courseMaterialVersionSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string().min(1),
  materialId: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  status: z.enum(["active", "retired"]),
  mediaType: z.string().min(1).max(200),
  original: podObjectReferenceSchema,
  extractedText: podObjectReferenceSchema.optional(),
  chunkIndex: podObjectReferenceSchema.optional(),
  pageCount: z.number().int().positive().optional(),
  objectiveAlignments: z.array(objectiveAlignmentSchema).max(200).default([]),
  license: z.object({
    identifier: z.string().max(300).optional(),
    sourceUrl: z.string().url().optional(),
    notes: z.string().max(2000).optional(),
  }).default({}),
  provenance: z.object({
    sourceName: z.string().min(1).max(500),
    processedBy: z.string().min(1).max(300),
    processedAt: timestampSchema,
    extractionMethod: z.string().min(1).max(300),
  }),
  createdAt: timestampSchema,
});

export type CourseMaterialVersion = z.infer<typeof courseMaterialVersionSchema>;

export const courseKnowledgePackageSchema = z.object({
  schemaVersion: z.literal("0.1"),
  courseId: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  status: z.enum(["draft", "published", "retired"]),
  owner: z.object({ id: z.string().min(1), webId: z.string().url().optional() }),
  materials: z.array(courseMaterialVersionSchema).max(1000),
  objectiveIds: z.array(z.string().min(1)).max(500).default([]),
  retrievalModes: z.array(z.enum(["host_native", "pod_lexical", "direct_reading"])).min(1),
  parentVersionDigest: digestSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type CourseKnowledgePackage = z.infer<typeof courseKnowledgePackageSchema>;

export const courseChunkSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string().min(1),
  materialVersionId: z.string().min(1),
  pageNumber: z.number().int().positive(),
  chunkIndex: z.number().int().nonnegative(),
  heading: z.string().max(1000).optional(),
  text: z.string().min(1).max(40_000),
  sha256: digestSchema,
});

export const courseChunkSetSchema = z.object({
  schemaVersion: z.literal("0.1"),
  materialVersionId: z.string().min(1),
  chunks: z.array(courseChunkSchema).min(1).max(20_000),
});

export type CourseChunk = z.infer<typeof courseChunkSchema>;

export const groundedCitationSchema = z.object({
  materialVersionId: z.string().min(1),
  chunkId: z.string().min(1),
  pageNumber: z.number().int().positive(),
  quote: z.string().min(1).max(4000),
});

export const groundedAnswerSchema = z.object({
  answer: z.string().min(1).max(30_000),
  groundingStatus: z.enum(["grounded", "partially_grounded", "not_found"]),
  citations: z.array(groundedCitationSchema).max(100),
  sourceLimitations: z.array(z.string().min(1).max(2000)).max(20).default([]),
  promptInjectionHandled: z.boolean(),
  provenance: z.object({
    host: z.string().min(1).max(300),
    model: z.string().max(300).optional(),
    retrievalMode: z.enum(["host_native", "pod_lexical", "direct_reading"]),
    courseId: z.string().min(1),
    courseVersion: z.number().int().positive(),
  }),
});

export type GroundedAnswer = z.infer<typeof groundedAnswerSchema>;

export const courseAccessGrantSchema = z.object({
  schemaVersion: z.literal("0.1"),
  id: z.string().min(1),
  courseId: z.string().min(1),
  courseVersion: z.number().int().positive(),
  manifestRef: podObjectReferenceSchema,
  manifestDigest: digestSchema,
  recipientId: z.string().min(1).optional(),
  status: z.enum(["active", "revoked"]),
  issuedAt: timestampSchema,
  expiresAt: timestampSchema.optional(),
  revokedAt: timestampSchema.optional(),
});

export type CourseAccessGrant = z.infer<typeof courseAccessGrantSchema>;

export function createCoursePackage(input: {
  courseId?: string;
  title: string;
  description?: string;
  owner: { id: string; webId?: string };
  retrievalModes?: Array<"host_native" | "pod_lexical" | "direct_reading">;
}) {
  const now = new Date().toISOString();
  return courseKnowledgePackageSchema.parse({
    schemaVersion: "0.1",
    courseId: input.courseId ?? uuidUrn(),
    version: 1,
    title: input.title,
    description: input.description,
    status: "draft",
    owner: input.owner,
    materials: [],
    objectiveIds: [],
    retrievalModes: input.retrievalModes ?? ["direct_reading"],
    createdAt: now,
    updatedAt: now,
  });
}

export function versionCoursePackage(input: unknown, patch: {
  title?: string;
  description?: string;
  status?: "draft" | "published" | "retired";
  objectiveIds?: string[];
  retrievalModes?: Array<"host_native" | "pod_lexical" | "direct_reading">;
}) {
  const course = courseKnowledgePackageSchema.parse(input);
  const now = new Date().toISOString();
  return courseKnowledgePackageSchema.parse({
    ...course,
    ...patch,
    version: course.version + 1,
    parentVersionDigest: courseContentDigest(course),
    status: patch.status ?? "draft",
    updatedAt: now,
  });
}

export function addMaterialVersion(courseInput: unknown, materialInput: unknown) {
  const course = courseKnowledgePackageSchema.parse(courseInput);
  const material = courseMaterialVersionSchema.parse(materialInput);
  const existingVersions = course.materials.filter((item) => item.materialId === material.materialId);
  if (existingVersions.some((item) => item.id === material.id)) throw new Error(`Material version '${material.id}' already exists.`);
  if (existingVersions.some((item) => item.version >= material.version)) {
    throw new Error("A replacement material version must have a greater version number.");
  }
  const materials = course.materials.map((item) => item.materialId === material.materialId && item.status === "active" ? { ...item, status: "retired" as const } : item);
  const next = versionCoursePackage(course, {});
  return courseKnowledgePackageSchema.parse({ ...next, materials: [...materials, { ...material, status: "active" }] });
}

export function retireMaterialVersion(courseInput: unknown, materialVersionId: string) {
  const course = courseKnowledgePackageSchema.parse(courseInput);
  if (!course.materials.some((item) => item.id === materialVersionId)) throw new Error(`No material version '${materialVersionId}'.`);
  const next = versionCoursePackage(course, {});
  return courseKnowledgePackageSchema.parse({
    ...next,
    materials: course.materials.map((item) => item.id === materialVersionId ? { ...item, status: "retired" as const } : item),
  });
}

export function validateCoursePackage(input: unknown) {
  const parsed = courseKnowledgePackageSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const course = parsed.data;
  const errors: string[] = [];
  const ids = new Set<string>();
  const activeByMaterial = new Map<string, number>();
  for (const material of course.materials) {
    if (ids.has(material.id)) errors.push(`Duplicate material version id '${material.id}'.`);
    ids.add(material.id);
    if (material.status === "active") activeByMaterial.set(material.materialId, (activeByMaterial.get(material.materialId) ?? 0) + 1);
    if (material.chunkIndex && !material.extractedText) errors.push(`Material '${material.id}' has a chunk index without extracted text.`);
  }
  for (const [materialId, count] of activeByMaterial) if (count > 1) errors.push(`Material '${materialId}' has more than one active version.`);
  if (course.status === "published" && !course.materials.some((item) => item.status === "active")) errors.push("A published course requires at least one active material.");
  return { valid: errors.length === 0, errors, course, digest: courseContentDigest(course) };
}

export function validateGroundedAnswer(input: unknown, chunksInput: unknown, allowedMaterialVersionIds: string[]) {
  const candidate = groundedAnswerSchema.safeParse(input);
  const chunkSet = z.array(courseChunkSchema).safeParse(chunksInput);
  const errors: string[] = [];
  if (!candidate.success) errors.push(...candidate.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  if (!chunkSet.success) errors.push(...chunkSet.error.issues.map((issue) => `chunks.${issue.path.join(".")}: ${issue.message}`));
  if (!candidate.success || !chunkSet.success) return { valid: false, errors };
  const allowed = new Set(allowedMaterialVersionIds);
  const chunks = new Map(chunkSet.data.map((chunk) => [chunk.id, chunk]));
  for (const citation of candidate.data.citations) {
    if (!allowed.has(citation.materialVersionId)) errors.push(`Citation '${citation.chunkId}' uses an unauthorized material version.`);
    const chunk = chunks.get(citation.chunkId);
    if (!chunk) {
      errors.push(`Citation chunk '${citation.chunkId}' was not supplied.`);
      continue;
    }
    if (chunk.materialVersionId !== citation.materialVersionId) errors.push(`Citation '${citation.chunkId}' names the wrong material version.`);
    if (chunk.pageNumber !== citation.pageNumber) errors.push(`Citation '${citation.chunkId}' names the wrong page.`);
    if (!chunk.text.includes(citation.quote)) errors.push(`Citation '${citation.chunkId}' quote is not an exact source span.`);
  }
  if (candidate.data.groundingStatus === "grounded" && candidate.data.citations.length === 0) errors.push("A grounded answer requires at least one citation.");
  if (candidate.data.groundingStatus === "partially_grounded" && candidate.data.citations.length === 0) errors.push("A partially grounded answer requires at least one citation.");
  if (candidate.data.groundingStatus === "not_found" && candidate.data.citations.length > 0) errors.push("A not-found answer must not present source citations as support.");
  return { valid: errors.length === 0, errors, candidate: candidate.data };
}

export function createCourseAccessGrant(input: {
  course: unknown;
  manifestRef: unknown;
  recipientId?: string;
  expiresAt?: string;
}) {
  const course = courseKnowledgePackageSchema.parse(input.course);
  if (course.status !== "published") throw new Error("Only a published course version can be shared.");
  return courseAccessGrantSchema.parse({
    schemaVersion: "0.1",
    id: uuidUrn(),
    courseId: course.courseId,
    courseVersion: course.version,
    manifestRef: input.manifestRef,
    manifestDigest: courseContentDigest(course),
    recipientId: input.recipientId,
    status: "active",
    issuedAt: new Date().toISOString(),
    expiresAt: input.expiresAt,
  });
}

export function revokeCourseAccessGrant(input: unknown) {
  const grant = courseAccessGrantSchema.parse(input);
  if (grant.status === "revoked") return grant;
  return courseAccessGrantSchema.parse({ ...grant, status: "revoked", revokedAt: new Date().toISOString() });
}

export function validateCourseAccess(input: unknown, expected: { recipientId?: string; courseId?: string; courseVersion?: number; manifestDigest?: string } = {}) {
  const parsed = courseAccessGrantSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  const grant = parsed.data;
  const errors: string[] = [];
  if (grant.status !== "active") errors.push("The course access grant is revoked.");
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now()) errors.push("The course access grant has expired.");
  if (expected.recipientId && grant.recipientId && grant.recipientId !== expected.recipientId) errors.push("The course access grant names a different recipient.");
  if (expected.courseId && grant.courseId !== expected.courseId) errors.push("The course access grant names a different course.");
  if (expected.courseVersion && grant.courseVersion !== expected.courseVersion) errors.push("The course access grant names a different version.");
  if (expected.manifestDigest && grant.manifestDigest !== expected.manifestDigest) errors.push("The course manifest digest does not match the grant.");
  return { valid: errors.length === 0, errors, grant };
}
